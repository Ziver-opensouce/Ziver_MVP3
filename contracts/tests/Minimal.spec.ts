import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Contract, contractAddress, Sender, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { MinimalContract } from '../wrappers/MinimalContract'; // FIX: The filename is MinimalContract

describe('Minimal Contract Test', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let minimalContract: SandboxContract<MinimalContract>;
    let code: Cell;

    beforeAll(async () => {
        // Compile the new minimal contract
        code = await compile('MinimalContract');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        minimalContract = blockchain.openContract(MinimalContract.createFromConfig({}, code));

        const deployResult = await minimalContract.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minimalContract.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and have initial value of 0', async () => {
        expect(await minimalContract.getValue()).toEqual(0n);
    });

    it('should set and get a new value', async () => {
        const setValueResult = await minimalContract.sendValue(deployer.getSender(), 123n);

        expect(setValueResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minimalContract.address,
            success: true,
        });

        expect(await minimalContract.getValue()).toEqual(123n);
    });
});
