import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
// FIX #1: The 'Sender' type is imported from '@ton/core', not '@ton/sandbox'.
import { Address, beginCell, Cell, ContractProvider, contractAddress, Sender, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

class MinimalContract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static async createFromConfig(code: Cell) {
        const data = beginCell().storeUint(0, 64).endCell();
        const init = { code, data };
        return new MinimalContract(contractAddress(0, init), init);
    }

    async sendSetValue(sender: Sender, value: bigint) {
        const msgBody = beginCell()
            .storeUint(0x1, 32) // opcode
            .storeUint(value, 64)
            .endCell();

        return sender.send({
            to: this.address,
            value: toNano('0.05'),
            body: msgBody,
        });
    }

    async getValue(provider: ContractProvider) {
        const result = await provider.get('get_value', []);
        return result.stack.readBigNumber();
    }
}

describe('Minimal Contract Test', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let minimalContract: SandboxContract<MinimalContract>;
    let code: Cell;

    beforeAll(async () => {
        code = await compile('minimal');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const minimal = await MinimalContract.createFromConfig(code);
        minimalContract = blockchain.openContract(minimal);

        // FIX #2: This is the correct way to send a deployment message.
        const deployResult = await deployer.send({
            to: minimalContract.address,
            value: toNano('0.5'),
            init: minimalContract.init,
        });

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
        const setValueResult = await minimalContract.sendSetValue(deployer.getSender(), 123n);

        expect(setValueResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minimalContract.address,
            success: true,
        });

        expect(await minimalContract.getValue()).toEqual(123n);
    });
});
