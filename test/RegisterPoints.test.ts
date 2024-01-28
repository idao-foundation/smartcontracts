import { signHardhat } from "./signatures";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
    AccessManager,
    AccessManager__factory,
    RegisterPoints,
    RegisterPoints__factory
} from "../typechain-types";

async function getLatestBlockTimestamp(): Promise<number> {
    const block = await ethers.provider.getBlock('latest', true);
    return block?.timestamp || 0;
}

describe("RegisterPoints", () => {
    let manager: AccessManager;
    let registerPoints: RegisterPoints;
    let admin: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    let addr2: HardhatEthersSigner;
    const ADMIN_ROLE = 0n;
    const name = "RegisterPoints";
    const version = "1";

    beforeEach(async () => {
        [admin, addr1, addr2] = await ethers.getSigners();

        const Manager = (await ethers.getContractFactory('AccessManager')) as AccessManager__factory;
        manager = await Manager.deploy(admin.address);

        const RegisterPoints = (await ethers.getContractFactory('RegisterPoints')) as RegisterPoints__factory;
        registerPoints = await upgrades.deployProxy(
            RegisterPoints,
            [manager.target, name, version],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as RegisterPoints;
    });

    describe('initial values', async () => {
        it('should set role', async () => {
            const [isAdmin,] = await manager.hasRole(ADMIN_ROLE, admin.address);
            expect(isAdmin).to.be.true;
        })
    });

    describe('addPoints', async () => {
        async function EIP712Fixture(nonce: number = 0) {
            const txTimestamp = await getLatestBlockTimestamp() + 3600;

            const data = {
                deadline: txTimestamp,
                nonce: nonce,
            }

            const signature = await signHardhat(admin, registerPoints.target as string, data);
            const sig = ethers.Signature.from(signature);

            return { data, sig };
        }

        async function addPointsWithSignature(accounts: string[], points: bigint[], nonce: number) {
            const { data, sig } = await EIP712Fixture(nonce);

            return registerPoints.addPoints(
                accounts,
                points,
                data.deadline,
                data.nonce,
                sig.v,
                sig.r,
                sig.s
            );
        }

        it('adds points succesfully', async () => {
            /* SETUP */
            const nonce = 0;
            const accounts = [addr1.address, addr2.address];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];

            /* ASSERT */
            expect(await registerPoints.nonces(admin.address, nonce)).to.be.false;

            /* EXECUTE */
            const tx = await addPointsWithSignature(accounts, points, nonce);

            /* ASSERT */
            expect(await registerPoints.nonces(admin.address, nonce)).to.be.true;

            for (let i = 0; i < accounts.length; i++) {
                expect(await registerPoints.pointsBalance(accounts[i])).to.equal(points[i]);

                await expect(tx).to.emit(registerPoints, 'PointsAdded')
                    .withArgs(accounts[i], points[i]);
            }
        });

        it('adds points if points were added previously', async () => {
            /* SETUP */
            let nonce = 0;
            const accounts = [addr1.address, addr2.address];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];

            await addPointsWithSignature(accounts, points, nonce);

            /* EXECUTE */
            await addPointsWithSignature(accounts, points, ++nonce);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                expect(await registerPoints.pointsBalance(accounts[i])).to.equal(points[i] * 2n);
            }
        });

        it('rejects when expired deadline', async () => {
            /* SETUP */
            const { data, sig } = await EIP712Fixture();

            ethers.provider.send("evm_increaseTime", [3601]);

            const accounts = [addr1.address, addr2.address];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];

            /* EXECUTE */
            const promise = registerPoints.addPoints(
                accounts,
                points,
                data.deadline,
                data.nonce,
                sig.v,
                sig.r,
                sig.s
            );

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(registerPoints, "ExpiredDeadline");
        });

        it('rejects when invalid signature', async () => {
            /* SETUP */
            const { data, sig } = await EIP712Fixture();

            const accounts = [addr1.address, addr2.address];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];
            const invalidDeadline = data.deadline + 1;

            /* EXECUTE */
            const promise = registerPoints.addPoints(
                accounts,
                points,
                invalidDeadline,
                data.nonce,
                sig.v,
                sig.r,
                sig.s
            );

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(registerPoints, "InvalidSignature");
        });

        it('rejects when invalid nonce', async () => {
            /* SETUP */
            const nonce = 0;
            const accounts = [addr1.address, addr2.address];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];

            await addPointsWithSignature(accounts, points, nonce);

            /* EXECUTE */
            const promise = addPointsWithSignature(accounts, points, nonce);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(registerPoints, "InvalidNonce");
        });

        it('should revert when users and points length are not the same', async () => {
            /* SETUP */
            const nonce = 0;
            const accounts = [addr1.address];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];

            /* EXECUTE */
            const promise = addPointsWithSignature(accounts, points, nonce);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(registerPoints, "DataLengthsMismatch");
        });

        it('should revert when users length is zero', async () => {
            /* SETUP */
            const nonce = 0;
            const accounts: string[] = [];
            const points = [ethers.parseUnits("1000"), ethers.parseUnits("2000")];

            /* EXECUTE */
            const promise = addPointsWithSignature(accounts, points, nonce);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(registerPoints, "DataLengthsIsZero");
        });
    });

    describe('upgradeToAndCall', async () => {
        let newImplementation: RegisterPoints;

        beforeEach(async () => {
            const factory = await ethers.getContractFactory("RegisterPoints");
            newImplementation = await factory.deploy();
        });

        it('should upgrade to a new implementation', async () => {
            /* SETUP */
            const implementationBefore = await upgrades.erc1967.getImplementationAddress(registerPoints.target as string);

            /* EXECUTE */
            await registerPoints.connect(admin).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            const implementationAfter = await upgrades.erc1967.getImplementationAddress(registerPoints.target as string);

            expect(implementationBefore).not.to.equal(implementationAfter);
        });

        it('rejects if not admin role', async function () {
            /* EXECUTE */
            const promise = registerPoints.connect(addr1).upgradeToAndCall(newImplementation.target, "0x");

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                registerPoints, 'AccessManagedUnauthorized'
            ).withArgs(addr1.address);
        });
    });
});
