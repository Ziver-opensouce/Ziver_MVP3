import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { TimedReleaseVault } from '../wrappers/TimedReleaseVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TimedReleaseVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TimedReleaseVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let timedReleaseVault: SandboxContract<TimedReleaseVault>;

    // Declare initialReleaseTimestamp here so it's accessible to all tests
    let initialReleaseTimestamp: number; // Added this line

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        timedReleaseVault = blockchain.openContract(TimedReleaseVault.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        // Assign the value here
        initialReleaseTimestamp = Math.floor(Date.now() / 1000) + 60; // Example: 60 seconds from now

        // Create the message body with the expected initial data
        const deployBody = beginCell()
            .storeUint(1, 32) // Opcode 1 for initialization
            .storeUint(initialReleaseTimestamp, 64)
            .endCell();

        const deployResult = await timedReleaseVault.sendDeploy(deployer.getSender(), toNano('0.05'), deployBody);

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: timedReleaseVault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and set initial state correctly', async () => { // Renamed for clarity
        // Assuming your wrapper has a getContractData method as discussed
        const { owner_address, release_timestamp, is_released } = await timedReleaseVault.getContractData();

        expect(owner_address.equals(deployer.address)).toBe(true);
        expect(release_timestamp).toBe(initialReleaseTimestamp); // Now initialReleaseTimestamp is defined
        expect(is_released).toBe(0);
    });

    // Add more test cases here for deposit, release, etc.
});
