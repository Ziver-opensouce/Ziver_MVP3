import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { TimedReeaseVault } from '../wrappers/TimedReeaseVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TimedReeaseVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TimedReeaseVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let timedReeaseVault: SandboxContract<TimedReeaseVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        timedReeaseVault = blockchain.openContract(TimedReeaseVault.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await timedReeaseVault.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: timedReeaseVault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and timedReeaseVault are ready to use
    });
});
