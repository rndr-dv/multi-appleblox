import { expect, mock, test } from 'bun:test';
import { requestAppAccessibility } from './permissions';

test('requests Accessibility from the MultaBlox app process', async () => {
	const writeProcessOutput = mock().mockResolvedValue(undefined);
	const delay = mock().mockResolvedValue(undefined);

	await requestAppAccessibility(writeProcessOutput, delay);

	expect(writeProcessOutput).toHaveBeenCalledWith('askPerm');
	expect(delay).toHaveBeenCalledWith(500);
});
