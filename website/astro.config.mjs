// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://tonymenu.app',
	integrations: [
		starlight({
			title: 'TonyMenu',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/vekexasia/tony-menu' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'docs/guides/example' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'docs/reference' } }],
				},
			],
		}),
	],
});
