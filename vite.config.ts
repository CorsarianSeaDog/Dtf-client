import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { build, defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { buildSvgSpriteDefs, collectUsedSymbolIds, parseSvgSprites } from './src/lib/assets/svgSprite.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function resolveVersion(command?: string): string {
	const raw =
		process.env.APP_VERSION ||
		(process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined) ||
		(() => {
			try {
				return execSync('git describe --tags --exact-match', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
			} catch {
				return undefined;
			}
		})();
	if (raw) return raw.replace(/^refs\/tags\//, '').replace(/^v/, '');

	// В dev-сервере держим стабильную версию, чтобы Vite не сбрасывал кэш зависимостей при каждом git-коммите
	if (command === 'serve') return `${pkg.version}-dev`;

	const commit =
		process.env.GITHUB_SHA?.slice(0, 7) ||
		(() => {
			try {
				return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
			} catch {
				return undefined;
			}
		})();

	return commit ? `${pkg.version}-${commit}` : pkg.version;
}

const basePath = process.env.BASE_PATH === '/' ? '' : (process.env.BASE_PATH || '').replace(/\/+$/, '');

const VIRTUAL_THEME_COMPONENTS_ID = 'virtual:theme-components';
const RESOLVED_VIRTUAL_THEME_COMPONENTS_ID = `\0${VIRTUAL_THEME_COMPONENTS_ID}`;

function themeComponentPathsPlugin(): Plugin {
	let themesDir = path.resolve('src/lib/themes');
	const isRootThemeComponent = (file: string) => {
		const rel = path.relative(themesDir, file);
		if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
		const parts = rel.split(path.sep);
		return parts.length === 2 && !parts[0].startsWith('.') && parts[1].endsWith('.svelte');
	};
	return {
		name: 'redtf-theme-component-paths',
		configResolved(config) {
			themesDir = path.resolve(config.root, 'src/lib/themes');
		},
		resolveId(id) {
			if (id === VIRTUAL_THEME_COMPONENTS_ID) return RESOLVED_VIRTUAL_THEME_COMPONENTS_ID;
		},
		load(id) {
			if (id !== RESOLVED_VIRTUAL_THEME_COMPONENTS_ID) return;
			const paths: string[] = [];
			for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
				if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
				for (const file of readdirSync(path.join(themesDir, entry.name))) {
					if (file.endsWith('.svelte')) paths.push(`./${entry.name}/${file}`);
				}
			}
			return `export default new Set(${JSON.stringify(paths)});`;
		},
		configureServer(server) {
			const invalidate = (file: string) => {
				if (!isRootThemeComponent(file)) return;
				const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_THEME_COMPONENTS_ID);
				if (mod) server.moduleGraph.invalidateModule(mod);
			};
			server.watcher.on('add', invalidate);
			server.watcher.on('unlink', invalidate);
		}
	};
}

const VIRTUAL_SPRITE_ID = 'virtual:svg-sprite';
const RESOLVED_VIRTUAL_SPRITE_ID = `\0${VIRTUAL_SPRITE_ID}`;
const SPRITE_PLACEHOLDER = '__REDTF_SVG_SPRITE__';
const SPRITE_FILES = ['src/lib/assets/icons.svg', 'src/lib/assets/reIcons.svg'];

function svgSpritePlugin(): Plugin {
	const readSprites = () => SPRITE_FILES.map((file) => readFileSync(file, 'utf8'));
	let isBuild = false;

	return {
		name: 'redtf-svg-sprite',
		configResolved(config) {
			isBuild = config.command === 'build';
		},
		resolveId(id) {
			if (id === VIRTUAL_SPRITE_ID) return RESOLVED_VIRTUAL_SPRITE_ID;
		},
		load(id, options) {
			if (id !== RESOLVED_VIRTUAL_SPRITE_ID) return;
			// В клиентской production-сборке ставим маркер и заполняем обрезанный спрайт в generateBundle по чанкам
			if (isBuild && !options?.ssr) {
				return `export default ${JSON.stringify(SPRITE_PLACEHOLDER)};`;
			}
			// В dev/SSR/vitest отдаём полный спрайт
			return `export default ${JSON.stringify(buildSvgSpriteDefs(readSprites()))};`;
		},
		handleHotUpdate({ file, server }) {
			const norm = file.replace(/\\/g, '/');
			if (SPRITE_FILES.some((f) => norm.endsWith(`/${f}`))) {
				const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_SPRITE_ID);
				if (mod) server.moduleGraph.invalidateModule(mod);
			}
		},
		generateBundle(_options, bundle) {
			const chunks = Object.values(bundle).filter(
				(item): item is Extract<(typeof bundle)[string], { type: 'chunk' }> => item.type === 'chunk'
			);
			const targets = chunks.filter((c) => c.code.includes(SPRITE_PLACEHOLDER));
			if (targets.length === 0) return;

			const sources = readSprites();
			const { symbols } = parseSvgSprites(sources);
			const usedIds = collectUsedSymbolIds(
				chunks.map((c) => c.code),
				symbols.keys()
			);
			const defs = buildSvgSpriteDefs(sources, usedIds);
			const literal = JSON.stringify(defs);
			for (const target of targets) {
				const next = target.code.replace(/(['"`])__REDTF_SVG_SPRITE__\1/g, () => literal);
				if (next === target.code) {
					throw new Error('Не удалось подставить SVG-спрайт в чанк сборки');
				}
				target.code = next;
			}
		}
	};
}

// SvelteKit не обрабатывает transformIndexHtml. Собираем синхронный запуск из тех же
// манифестов и функций, что использует приложение, и встраиваем в его шаблон.
async function writeAppTemplate() {
	const result = await build({
		configFile: false,
		logLevel: 'silent',
		resolve: { alias: { '$lib': path.resolve('./src/lib') } },
		build: {
			write: false,
			minify: true,
			lib: { entry: 'src/lib/themes/bootstrap.ts', formats: ['iife'], name: 'reDTFAppearance' }
		}
	});
	const bundle = Array.isArray(result) ? result[0] : result;
	if (!('output' in bundle)) throw new Error('Не удалось собрать оформление запуска');
	const code = bundle.output.find(item => item.type === 'chunk')?.code;
	if (!code) throw new Error('Не найден код оформления запуска');
	const template = readFileSync('src/app.html', 'utf8').replace('<!-- redtf:appearance -->', `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`);
	mkdirSync('.svelte-kit', { recursive: true });
	writeFileSync('.svelte-kit/app-template.html', template);
}

export default defineConfig(async ({ command }) => {
	await writeAppTemplate();
	const appVersion = resolveVersion(command);

	return {
		resolve: {
			alias: {
				'$lib': path.resolve('./src/lib')
			}
		},
		optimizeDeps: {
			include: [
				'@capacitor/app',
				'@capacitor/browser',
				'@capacitor/core',
				'@capacitor/splash-screen',
				'@capacitor/status-bar',
				'@capgo/capacitor-updater',
				'dompurify',
				'photoswipe',
				'lottie-web/build/player/lottie_light',
				'@editorjs/editorjs',
				'@editorjs/header',
				'@editorjs/image',
				'@editorjs/list',
				'@editorjs/quote',
				'@editorjs/code',
				'@editorjs/delimiter'
			]
		},
		plugins: [
			sveltekit({
				files: { appTemplate: ".svelte-kit/app-template.html" },
				serviceWorker: { register: command === 'build' },
				version: {
					name: appVersion
				},
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter({
					fallback: '404.html'
				}),
				paths: {
					base: basePath as `/${string}`,
					relative: false
				},
				prerender: {
					handleUnseenRoutes: 'ignore'
				}
			}),
			{
				name: 'redtf-appearance-template',
				async handleHotUpdate({ file }: { file: string }) {
					if (file.endsWith('/src/app.html') || /\/src\/lib\/(themes|storage)\/.*\.ts$/.test(file)) await writeAppTemplate();
				}
			},
			svgSpritePlugin(),
			themeComponentPathsPlugin()
		]
	};
});
