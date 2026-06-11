<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		detectAccountFromBinaryCookies,
		getAccounts,
		type AccountInfo,
	} from '../../ts/roblox/accounts';
	import { PathManager } from '../../ts/roblox/path-manager';
	import { libraryPath } from '../../ts/libraries';
	import { shell } from '../../ts/tools/shell';
	import {
		type InputEvidence,
		type Observation,
		saveFeasibilityEvidence,
	} from '../../ts/multi-instance/evidence';
	import {
		defaultLaunchDependencies,
		launchAccount,
		launchAccountsSequentially,
	} from '../../ts/multi-instance/launcher';
	import { InstanceProbe } from '../../ts/multi-instance/probe';
	import { InstanceRegistry } from '../../ts/multi-instance/registry';
	import type {
		LaunchMethod,
		ManagedInstance,
	} from '../../ts/multi-instance/types';

	const registry = new InstanceRegistry();
	const probe = new InstanceProbe(libraryPath('instance_probe'));
	const options: Observation[] = ['pending', 'pass', 'fail', 'unsupported'];
	const probeActions: { eventClass: keyof InputEvidence; label: string }[] = [
		{ eventClass: 'keyboard', label: 'Send Space' },
		{ eventClass: 'click', label: 'Click Center' },
		{ eventClass: 'move', label: 'Move Center' },
		{ eventClass: 'scroll', label: 'Scroll' },
	];

	let accounts: AccountInfo[] = [];
	let selectedUserIds: number[] = [];
	let placeId = '13379208636';
	const launchMethod: LaunchMethod = 'isolated-profile';
	let instances: ManagedInstance[] = [];
	let observations: Record<string, InputEvidence> = {};
	let robloxPath = '';
	let busy = false;
	let lastMessage = '';

	onMount(async () => {
		await detectAccountFromBinaryCookies();
		accounts = await getAccounts();
	});

	function toggleAccount(userId: number): void {
		selectedUserIds = selectedUserIds.includes(userId)
			? selectedUserIds.filter((candidate) => candidate !== userId)
			: [...selectedUserIds, userId];
	}

	function emptyInputEvidence(): InputEvidence {
		return {
			keyboard: 'pending',
			click: 'pending',
			move: 'pending',
			scroll: 'pending',
		};
	}

	function setObservation(
		instanceId: string,
		eventClass: keyof InputEvidence,
		observation: Observation
	): void {
		observations = {
			...observations,
			[instanceId]: {
				...(observations[instanceId] ?? emptyInputEvidence()),
				[eventClass]: observation,
			},
		};
	}

	function handleObservationChange(
		instanceId: string,
		eventClass: keyof InputEvidence,
		event: Event
	): void {
		if (!(event.currentTarget instanceof HTMLSelectElement)) return;
		setObservation(instanceId, eventClass, event.currentTarget.value as Observation);
	}

	async function runLaunchExperiment(): Promise<void> {
		if (!/^\d+$/.test(placeId)) {
			toast.error('Place ID must contain only digits');
			return;
		}
		const selectedAccounts = accounts.filter((account) => selectedUserIds.includes(account.userId));
		if (selectedAccounts.length === 0) {
			toast.error('Select at least one saved account');
			return;
		}

		busy = true;
		lastMessage = '';
		try {
			await PathManager.initialize();
			robloxPath = PathManager.getPath() ?? '';
			if (!robloxPath) throw new Error('Roblox installation was not found');
			const launchDependencies = defaultLaunchDependencies(robloxPath);

			await launchAccountsSequentially(selectedAccounts, async (account) => {
				const result = await launchAccount(
					account,
					{ kind: 'place', placeId },
					launchMethod,
					registry,
					launchDependencies
				);
				if (result.state === 'running' && result.process) {
					try {
						registry.setWindow(result.id, await probe.window(result.process.pid));
					} catch (error) {
						lastMessage = error instanceof Error ? error.message : String(error);
					}
					observations = {
						...observations,
						[result.id]: observations[result.id] ?? emptyInputEvidence(),
					};
				}
				instances = registry.list();
				return result;
			});
			instances = registry.list();
		} catch (error) {
			lastMessage = error instanceof Error ? error.message : String(error);
			toast.error(lastMessage);
		} finally {
			busy = false;
		}
	}

	async function sendProbeAction(
		instance: ManagedInstance,
		eventClass: keyof InputEvidence
	): Promise<void> {
		if (!instance.process) return;
		try {
			switch (eventClass) {
				case 'keyboard':
					await probe.key(instance.process.pid, 49);
					break;
				case 'click':
					await probe.clickCenter(instance.process.pid);
					break;
				case 'move':
					await probe.moveCenter(instance.process.pid);
					break;
				case 'scroll':
					await probe.scroll(instance.process.pid, -3);
					break;
			}
			lastMessage = `${eventClass} event posted to PID ${instance.process.pid}; verify it in Roblox`;
		} catch (error) {
			lastMessage = error instanceof Error ? error.message : String(error);
			setObservation(instance.id, eventClass, 'fail');
		}
	}

	async function saveEvidence(): Promise<void> {
		if (!robloxPath) {
			toast.error('Run a launch experiment first');
			return;
		}
		const macOSVersion = (
			await shell('sw_vers', ['-productVersion'], { skipStderrCheck: true })
		).stdOut.trim();
		const filePath = await saveFeasibilityEvidence({
			schemaVersion: 1,
			createdAt: new Date().toISOString(),
			macOSVersion,
			robloxPath,
			placeId,
			instances: instances.map((instance) => ({
				accountUserId: instance.account.userId,
				expectedUsername: instance.account.username,
				pid: instance.process?.pid ?? null,
				processStartedAt: instance.process?.startedAt ?? null,
				windowId: instance.window?.windowId ?? null,
				launchMethod: instance.method,
				launchState: instance.state,
				input: observations[instance.id] ?? emptyInputEvidence(),
				error: instance.error,
			})),
		});
		toast.success(`Saved Phase 0 evidence to ${filePath}`);
	}
</script>

<section class="m-4 rounded-lg border border-border p-4 space-y-4">
	<header>
		<h2 class="text-lg font-semibold">MultaBlox Phase 0 Feasibility</h2>
		<p class="text-sm text-muted-foreground">
			Developer-only account isolation, process ownership, window discovery, and targeted input tests.
		</p>
	</header>

	<div class="grid grid-cols-2 gap-4">
		<label class="space-y-1">
			<span class="text-sm">Place ID</span>
			<input class="w-full rounded border bg-background px-2 py-1" bind:value={placeId} />
		</label>
		<div class="space-y-1">
			<span class="text-sm">Launch method</span>
			<p class="rounded border bg-muted px-2 py-1 text-sm">Isolated account profiles</p>
		</div>
	</div>

	<div class="space-y-2">
		<h3 class="font-medium">Saved accounts</h3>
		{#each accounts as account}
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					checked={selectedUserIds.includes(account.userId)}
					on:change={() => toggleAccount(account.userId)}
				/>
				<span>{account.displayName} (@{account.username})</span>
			</label>
		{/each}
	</div>

	<div class="flex gap-2">
		<button class="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={busy} on:click={runLaunchExperiment}>
			{busy ? 'Launching...' : 'Launch Selected'}
		</button>
		<button class="rounded border px-3 py-2" disabled={instances.length === 0} on:click={saveEvidence}>
			Save Evidence
		</button>
	</div>

	{#if lastMessage}
		<p class="text-sm">{lastMessage}</p>
	{/if}

	<div class="space-y-3">
		{#each instances as instance}
			<article class="rounded border border-border p-3 space-y-2">
				<div>
					<strong>{instance.account.displayName}</strong>
					<span class="ml-2 text-sm text-muted-foreground">{instance.state}</span>
				</div>
				<p class="text-xs">
					PID {instance.process?.pid ?? 'none'} |
					Start {instance.process?.startedAt ?? 'none'} |
					Window {instance.window?.windowId ?? 'none'}
				</p>
				{#if instance.error}
					<p class="text-sm text-destructive">{instance.error}</p>
				{/if}
				{#if instance.state === 'running' && instance.process}
					{#each probeActions as action}
						<div class="flex items-center gap-2">
							<button
								class="rounded border px-2 py-1 text-sm"
								on:click={() => sendProbeAction(instance, action.eventClass)}
							>
								{action.label}
							</button>
							<select
								class="rounded border bg-background px-2 py-1 text-sm"
								value={observations[instance.id]?.[action.eventClass] ?? 'pending'}
								on:change={(event) => handleObservationChange(instance.id, action.eventClass, event)}
							>
								{#each options as option}
									<option value={option}>{option}</option>
								{/each}
							</select>
						</div>
					{/each}
				{/if}
			</article>
		{/each}
	</div>
</section>
