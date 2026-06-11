<script lang="ts">
	import { events } from '@neutralinojs/lib';
	import { LayoutGrid, Play } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import LoadingSpinner from '../../components/loading-spinner.svelte';
	import PathSelector from '../../components/roblox/path-selector.svelte';
	import RobloxDownloadButton from '../../components/roblox/roblox-download-button.svelte';
	import { SettingsPanelBuilder, setValue } from '../../components/settings';
	import Panel from '../../components/settings/panel.svelte';
	import type { SettingsOutput } from '../../components/settings/types';
	import Roblox from '../../ts/roblox';
	import Logger from '@/windows/main/ts/utils/logger';

	export let render = true;

	async function buttonClicked(e: CustomEvent) {
		const { id } = e.detail;
		switch (id) {
			case 'open_instances_btn':
				await events.broadcast('ui:change_page', { id: 'instances' });
				break;
			case 'create_shortcut_btn':
				try {
					await Roblox.Utils.createShortcut();
				} catch (err) {
					Logger.error(err);
					toast.error('An error occurred while trying to save the shortcut', {
						duration: 2000,
					});
					return;
				}
				break;
		}
	}

	async function switchClicked(e: CustomEvent) {
		const { id, state } = e.detail;
		switch (id) {
			case 'delegate':
				await Roblox.Delegate.toggle(state);
				break;
			case 'background_updates':
				try {
					await Roblox.Updates.setLaunchAgentState(state);
				} catch (err) {
					await setValue('roblox.background.background_updates', !state);
					events.broadcast('app:reload');
					if ((err as Error).message.includes('-128')) return;
					toast.error('An error occurred while setting Roblox background updates state');
					Logger.error('An error occurred while setting Roblox background updates state:', err);
				}
		}
	}

	const panel = new SettingsPanelBuilder()
		.setName('Roblox')
		.setDescription('Roblox application settings and other bootstrapper behavior')
		.setId('roblox') // Not updating the ID to preserve old settings
		.addCategory((category) =>
			category
				.setName('Roblox Installation')
				.setDescription('Configure how AppleBlox detects your Roblox installation')
				.setId('installation')
				.addCustom({
					label: '',
					description: '',
					id: 'path_selector',
					component: PathSelector,
					separator: false,
				})
		)
		.addCategory((category) =>
			category
				.setName('Background Processes')
				.setDescription('Control background processes related to Roblox')
				.setId('background')
				.addSwitch({
					label: 'Background updates',
					description:
						'Automatically update Roblox without needing AppleBlox or Roblox to opened.',
					default: false,
					id: 'background_updates',
				})
		)
		.addCategory((category) =>
			category
				.setName('Bootstrapper Behavior')
				.setDescription('Control how Roblox launches and how AppleBlox should handle each instance')
				.setId('behavior')
				.addSwitch({
					label: 'Delegate launching to AppleBlox',
					description: 'Let AppleBlox configure settings before launching Roblox',
					id: 'delegate',
					default: false,
				})
				.addSwitch({
					label: 'Return to website',
					description:
						'Automatically open the <a href="https://www.roblox.com">www.roblox.com</a> website when closing Roblox.',
					id: 'return_to_website',
					default: false,
				})
				.addSwitch({
					label: 'Exit AppleBlox when Roblox is closed',
					description: 'Automatically close AppleBlox if the Roblox Desktop app is closed.',
					id: 'close_on_exit',
					default: false,
				})
				.addSwitch({
					label: 'Disable Desktop app',
					description: 'Automatically close Roblox when leaving games',
					id: 'disable_desktop_app',
					default: false,
				})
				.addSeparator({ orientation: 'horizontal' })
				.addButton({
					label: 'Create Launch Shortcut',
					description: 'Create a desktop shortcut that launches Roblox with AppleBlox features',
					id: 'create_shortcut_btn',
					variant: 'default',
					icon: { component: Play },
				})
				.addCustom({
					label: '',
					description: '',
					id: 'download_roblox',
					component: RobloxDownloadButton,
					separator: false,
				})
		)
		.addCategory((category) =>
			category
				.setName('Multiple Instances')
				.setDescription('Launch and manage isolated Roblox accounts')
				.setId('multi_instances')
				.addButton({
					label: 'Open Instances',
					description: 'Manage accounts, windows, tiling, and input mirroring',
					id: 'open_instances_btn',
					variant: 'default',
					icon: { component: LayoutGrid },
				})
		)
		.build();

	let overrides: SettingsOutput = {};
	async function loadOverrides() {
		try {
			overrides = {
				launching: {
					delegate: await Roblox.Delegate.check(true),
				},
			};
		} catch (err) {
			Logger.warn("Couldn't load overrides:", err);
		}
	}
</script>

{#await loadOverrides()}
	{#if render}
		<LoadingSpinner />
	{/if}
{:then}
	<Panel {panel} on:switch={switchClicked} on:button={buttonClicked} {render} {overrides} />
{:catch error}
	{#if render}
		<h2 class="text-red-500">An error occurred while loading settings overrides</h2>
		<p class="text-red-300">{error}</p>
	{/if}
{/await}
