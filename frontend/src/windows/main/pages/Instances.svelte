<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import {
		ExternalLink,
		Check,
		Focus,
		Grid2X2,
		Keyboard,
		LoaderCircle,
		LogIn,
		Power,
		User,
		Users,
	} from 'lucide-svelte';
	import { events } from '@neutralinojs/lib';
	import { getAccounts, type AccountInfo } from '../ts/roblox/accounts';
	import { getInstanceRuntime, type InstanceRuntime } from '../ts/multi-instance/runtime';
	import type { InputMirrorSnapshot } from '../ts/multi-instance/input-mirror';
	import { parseLaunchTarget } from '../ts/multi-instance/launch-target';
	import type { TileCapacity } from '../ts/multi-instance/tile-layout';
	import type { ManagedInstance } from '../ts/multi-instance/types';
	import Logger from '@/windows/main/ts/utils/logger';

	const logger = Logger.withContext('InstancesPage');
	const defaultMirror: InputMirrorSnapshot = {
		enabled: false,
		sourcePid: null,
		error: null,
		hotkey: 'Command+Shift+M',
	};
	const tileLayouts: { value: string; capacity: TileCapacity; label: string }[] = [
		{ value: '4', capacity: 4, label: '4 windows (2x2)' },
		{ value: '6', capacity: 6, label: '6 windows (3x2)' },
		{ value: '9', capacity: 9, label: '9 windows (3x3)' },
	];

	let runtime: InstanceRuntime | null = null;
	let accounts: AccountInfo[] = [];
	let selectedUserIds: number[] = [];
	let instances: ManagedInstance[] = [];
	let mirror = defaultMirror;
	let placeId = '';
	let loading = true;
	let launching = false;
	let tileCapacity: TileCapacity = 4;
	let capabilityError: string | null = null;
	let unsubscribeInstances: (() => void) | null = null;
	let unsubscribeMirror: (() => void) | null = null;

	onMount(async () => {
		try {
			accounts = await getAccounts();
			runtime = await getInstanceRuntime();
			unsubscribeInstances = runtime.manager.subscribe((nextInstances) => {
				instances = nextInstances;
				capabilityError = runtime?.manager.capabilityError() ?? null;
			});
			unsubscribeMirror = runtime.mirror.subscribe((snapshot) => {
				mirror = snapshot;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('Failed to initialize Instances page:', error);
			toast.error(message);
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		unsubscribeInstances?.();
		unsubscribeMirror?.();
	});

	function toggleAccount(userId: number): void {
		selectedUserIds = selectedUserIds.includes(userId)
			? selectedUserIds.filter((candidate) => candidate !== userId)
			: [...selectedUserIds, userId];
	}

	async function launchSelected(): Promise<void> {
		if (!runtime) return;
		const selected = accounts.filter((account) => selectedUserIds.includes(account.userId));
		if (selected.length === 0) {
			toast.error('Select at least one saved account');
			return;
		}

		launching = true;
		try {
			await runtime.manager.launch(selected, parseLaunchTarget(placeId));
			capabilityError = runtime.manager.capabilityError();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('Failed to launch selected accounts:', error);
			toast.error(message);
		} finally {
			launching = false;
		}
	}

	async function focusInstance(instance: ManagedInstance): Promise<void> {
		if (!runtime) return;
		try {
			await runtime.manager.focus(instance.id);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function closeInstance(instance: ManagedInstance): Promise<void> {
		if (!runtime) return;
		try {
			await runtime.manager.close(instance.id);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function tileWindows(): Promise<void> {
		if (!runtime) return;
		try {
			await runtime.manager.requestAccessibility();
			await runtime.manager.tile();
			capabilityError = runtime.manager.capabilityError();
			if (capabilityError) toast.error(capabilityError);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			capabilityError = message;
			toast.error(message);
		}
	}

	function setTileCapacity(capacity: TileCapacity): void {
		tileCapacity = capacity;
		runtime?.manager.setTileCapacity(capacity);
	}

	function handleTileLayoutChange(selected: { value: string } | undefined): void {
		if (!selected) return;
		const layout = tileLayouts.find((candidate) => candidate.value === selected.value);
		if (layout) setTileCapacity(layout.capacity);
	}

	async function setMirrorEnabled(enabled: boolean): Promise<void> {
		if (!runtime) return;
		try {
			await runtime.mirror.setEnabled(enabled);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	function sourceAccount(): ManagedInstance | null {
		if (mirror.sourcePid === null) return null;
		return instances.find((instance) => instance.process?.pid === mirror.sourcePid) ?? null;
	}

	function statusVariant(state: ManagedInstance['state']): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (state === 'running') return 'default';
		if (state === 'failed' || state === 'crashed') return 'destructive';
		if (state === 'exited') return 'outline';
		return 'secondary';
	}

	function openAccounts(): void {
		events.broadcast('ui:change_page', { id: 'account' });
	}
</script>

{#if loading}
	<div class="flex h-[100vh] w-full items-center justify-center">
		<LoaderCircle class="w-7 h-7 animate-spin text-primary" />
	</div>
{:else}
	<div class="pb-6">
		<Card.Root class="font-mono grid grid-cols-1 h-full text-start ml-8 my-3 p-5 w-[95%] border-border/50">
			<p class="text-3xl font-bold text-black dark:text-white">Instances</p>
			<p class="text-[13px] text-neutral-700 dark:text-neutral-300">
				Launch, arrange, and control your managed Roblox accounts
			</p>
		</Card.Root>

		<Card.Root class="font-mono grid grid-cols-1 h-full text-start ml-8 my-4 p-5 w-[95%] border-border/50">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xl font-bold text-primary">Launch Accounts</p>
					<p class="text-[13px] text-primary saturate-[20%] brightness-200 font-semibold">
						Optionally join one experience with every selected account
					</p>
				</div>
				<Badge variant="outline">{selectedUserIds.length} selected</Badge>
			</div>

			{#if accounts.length === 0}
				<div class="mt-5 flex items-center justify-between rounded-lg border border-dashed border-border/60 p-5">
					<div class="flex items-center gap-3">
						<LogIn class="w-5 h-5 text-muted-foreground" />
						<div>
							<p class="font-semibold">No saved accounts</p>
							<p class="text-xs text-muted-foreground">Add a Roblox account before launching instances.</p>
						</div>
					</div>
					<Button variant="outline" on:click={openAccounts}>
						<ExternalLink class="w-4 h-4 mr-2" />
						Open Accounts
					</Button>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
					{#each accounts as account (account.userId)}
						<button
							type="button"
							class={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
								selectedUserIds.includes(account.userId)
									? 'border-primary bg-primary/5'
									: 'border-border/60'
							}`}
							aria-pressed={selectedUserIds.includes(account.userId)}
							on:click={() => toggleAccount(account.userId)}
						>
							<div
								class={`box-content h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center ${
									selectedUserIds.includes(account.userId)
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-primary'
								}`}
							>
								{#if selectedUserIds.includes(account.userId)}
									<Check class="h-3.5 w-3.5" />
								{/if}
							</div>
							{#if account.avatarUrl}
								<img src={account.avatarUrl} alt={account.displayName} class="w-10 h-10 rounded-full bg-muted" />
							{:else}
								<div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
									<User class="w-5 h-5 text-muted-foreground" />
								</div>
							{/if}
							<div class="min-w-0">
								<p class="font-semibold truncate">{account.displayName}</p>
								<p class="text-xs text-muted-foreground truncate">@{account.username}</p>
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<div class="flex items-end gap-3 mt-5">
				<label class="flex-1 space-y-1" for="instances-place-id">
					<span class="text-sm font-semibold">Experience (optional)</span>
					<Input
						id="instances-place-id"
						bind:value={placeId}
						inputmode="numeric"
						placeholder="Insert experience here"
					/>
				</label>
				<Button on:click={launchSelected} disabled={launching || accounts.length === 0}>
					{#if launching}
						<LoaderCircle class="w-4 h-4 mr-2 animate-spin" />
					{:else}
						<Users class="w-4 h-4 mr-2" />
					{/if}
					{launching ? 'Launching...' : 'Launch Selected'}
				</Button>
			</div>
		</Card.Root>

		<Card.Root class="font-mono grid grid-cols-1 h-full text-start ml-8 my-4 p-5 w-[95%] border-border/50">
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-xl font-bold text-primary">Window Controls</p>
					<p class="text-[13px] text-primary saturate-[20%] brightness-200 font-semibold">
						The first {tileCapacity} managed windows tile automatically
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Select.Root
						selected={tileLayouts.find((layout) => layout.capacity === tileCapacity)}
						onSelectedChange={handleTileLayoutChange}
					>
						<Select.Trigger class="w-[170px]" aria-label="Tile layout">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							{#each tileLayouts as layout}
								<Select.Item value={layout.value} label={layout.label}>{layout.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<Button
						variant="outline"
						on:click={tileWindows}
						disabled={!instances.some((instance) => instance.state === 'running')}
					>
						<Grid2X2 class="w-4 h-4 mr-2" />
						Tile Windows
					</Button>
				</div>
			</div>

			<div class="mt-5 flex items-center justify-between rounded-lg border border-border/60 p-4">
				<div class="flex items-center gap-3">
					<Keyboard class="w-5 h-5 text-primary" />
					<div>
						<p class="font-semibold">All Input Mode</p>
						<p class="text-xs text-muted-foreground">
							{mirror.enabled
								? `Source: ${sourceAccount()?.account.displayName ?? 'focused managed instance'}`
								: `Global toggle: ${mirror.hotkey}`}
						</p>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<Badge variant="secondary">
						{instances.filter((instance) => instance.mirrorReceiver && instance.state === 'running').length} receivers
					</Badge>
					<Switch
						checked={mirror.enabled}
						disabled={!instances.some((instance) => instance.mirrorReceiver && instance.state === 'running')}
						onCheckedChange={setMirrorEnabled}
					/>
				</div>
			</div>

			{#if capabilityError || mirror.error}
				<div class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{mirror.error ?? capabilityError}
				</div>
			{/if}
		</Card.Root>

		<Card.Root class="font-mono grid grid-cols-1 h-full text-start ml-8 my-4 p-5 w-[95%] border-border/50">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xl font-bold text-primary">Managed Instances</p>
					<p class="text-[13px] text-primary saturate-[20%] brightness-200 font-semibold">
						Only Roblox processes launched by MultaBlox appear here
					</p>
				</div>
				<Badge variant="outline">{instances.filter((instance) => instance.state === 'running').length} running</Badge>
			</div>

			{#if instances.length === 0}
				<div class="py-12 text-center">
					<Power class="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
					<p class="text-muted-foreground">No managed instances yet</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-5">
					{#each instances as instance (instance.id)}
						<div class="rounded-lg border border-border/60 p-4">
							<div class="flex items-start justify-between gap-3">
								<div class="flex items-center gap-3 min-w-0">
									{#if instance.account.avatarUrl}
										<img
											src={instance.account.avatarUrl}
											alt={instance.account.displayName}
											class="w-10 h-10 rounded-full bg-muted"
										/>
									{:else}
										<div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
											<User class="w-5 h-5 text-muted-foreground" />
										</div>
									{/if}
									<div class="min-w-0">
										<p class="font-semibold truncate">{instance.account.displayName}</p>
										<p class="text-xs text-muted-foreground truncate">
											@{instance.account.username} · PID {instance.process?.pid ?? 'pending'}
										</p>
									</div>
								</div>
								<Badge variant={statusVariant(instance.state)}>{instance.state}</Badge>
							</div>

							{#if instance.error}
								<p class="mt-3 text-sm text-destructive">{instance.error}</p>
							{/if}

							<div class="flex items-center justify-between gap-3 mt-4">
								<label
									for={`mirror-receiver-${instance.id}`}
									class="flex items-center gap-2 text-sm"
									class:opacity-50={instance.state !== 'running'}
								>
									<Checkbox
										id={`mirror-receiver-${instance.id}`}
										checked={instance.mirrorReceiver}
										disabled={instance.state !== 'running'}
										on:click={() => runtime?.manager.setMirrorReceiver(instance.id, !instance.mirrorReceiver)}
									/>
									Mirror receiver
								</label>
								<div class="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										disabled={instance.state !== 'running'}
										on:click={() => focusInstance(instance)}
									>
										<Focus class="w-4 h-4 mr-1.5" />
										Focus
									</Button>
									<Button
										variant="destructive"
										size="sm"
										disabled={instance.state !== 'running'}
										on:click={() => closeInstance(instance)}
									>
										<Power class="w-4 h-4 mr-1.5" />
										Close
									</Button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Root>
	</div>
{/if}
