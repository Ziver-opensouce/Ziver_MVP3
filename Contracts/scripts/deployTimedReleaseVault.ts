import { toNano, beginCell } from '@ton/core';
import { TimedReleaseVault } from '../wrappers/TimedReleaseVault';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const timedReleaseVault = provider.open(TimedReleaseVault.createFromConfig({}, await compile('TimedReleaseVault')));

    // Define the initial release timestamp, e.g., 1 hour from now
    // Current time is Saturday, July 5, 2025 at 10:57:30 PM WAT.
    const initialReleaseTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600); // Current time + 3600 seconds (1 hour)

    // Create the message body for contract initialization
    // Opcode 1 for initialization, followed by the release_timestamp
    const deployBody = beginCell()
        .storeUint(1, 32) // Opcode 1 for initialization
        .storeUint(initialReleaseTimestamp, 64) // Store the release timestamp (64 bits)
        .endCell();

    // Send the deploy transaction with the custom body
    await timedReleaseVault.sendDeploy(provider.sender(), toNano('0.05'), deployBody);

    await provider.waitForDeploy(timedReleaseVault.address);

    console.log('TimedReleaseVault deployed successfully!');
    console.log(`Contract Address: ${timedReleaseVault.address}`);
    console.log(`Initial Release Timestamp (Unix): ${initialReleaseTimestamp}`);

    // run methods on `timedReleaseVault`
    // Call getContractData without the 'provider' argument
    const contractData = await timedReleaseVault.getContractData(); // Corrected line
    console.log(`Owner Address: ${contractData.owner_address.toString()}`);
    console.log(`Stored Release Timestamp: ${contractData.release_timestamp}`);
    console.log(`Is Released: ${contractData.is_released}`);
}
