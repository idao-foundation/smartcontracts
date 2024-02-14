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
import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("RegisterPoints", () => {
    let manager: AccessManager;
    let registerPoints: RegisterPoints;
    let admin: HardhatEthersSigner;
    let forecastPointsIssuer: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    const ADMIN_ROLE = 0n;

    before(async () => {
        await reset();
    });

    beforeEach(async () => {
        [admin, forecastPointsIssuer, addr1] = await ethers.getSigners();

        const Manager = (await ethers.getContractFactory('AccessManager')) as AccessManager__factory;
        manager = await Manager.deploy(admin.address);

        const RegisterPoints = (await ethers.getContractFactory('RegisterPoints')) as RegisterPoints__factory;
        registerPoints = await upgrades.deployProxy(
            RegisterPoints,
            [manager.target],
            { initializer: 'initialize', kind: 'uups' }
        ) as unknown as RegisterPoints;

        await manager.connect(admin).grantRole(await registerPoints.FORECAST_POINTS_ISSUER_ROLE(), forecastPointsIssuer.address, 0);
    });

    describe('initial values', async () => {
        it('should set role', async () => {
            /* EXECUTE */
            const [isAdmin,] = await manager.hasRole(ADMIN_ROLE, admin.address);
            const [isForecastPointsIssuer,] = await manager.hasRole(await registerPoints.FORECAST_POINTS_ISSUER_ROLE(), forecastPointsIssuer.address);

            /* ASSERT */
            expect(isAdmin).to.be.true;
            expect(isForecastPointsIssuer).to.be.true;
        })
    });

    describe('claimPoints', async () => {
        async function EIP712Fixture(account: string, points: bigint, nonce: number = 0) {
            const data = {
                amount: points,
                receiver: account,
                nonce: nonce,
            }

            const signature = await signHardhat(forecastPointsIssuer, registerPoints.target as string, data);
            const sig = ethers.Signature.from(signature);

            return { data, sig };
        }

        async function claimPointsWithSignature(account: string, points: bigint, nonce: number) {
            const { data, sig } = await EIP712Fixture(account, points, nonce);

            return registerPoints.claimPoints(
                account,
                points,
                data.nonce,
                sig.v,
                sig.r,
                sig.s
            );
        }

        it('adds points succesfully', async () => {
            /* SETUP */
            const nonce = 0;
            const account = addr1.address;
            const points = ethers.parseUnits("1000");

            /* ASSERT */
            expect(await registerPoints.isNonceUsed(nonce)).to.be.false;

            /* EXECUTE */
            const tx = await claimPointsWithSignature(account, points, nonce);

            /* ASSERT */
            expect(await registerPoints.isNonceUsed(nonce)).to.be.true;
            expect(await registerPoints.batchIsNonceUsed([nonce])).to.deep.equal([true]);
            expect(await registerPoints.pointsBalance(account)).to.equal(points);

            await expect(tx).to.emit(registerPoints, 'PointsAdded')
                .withArgs(account, points);
        });

        it('adds points if points were added previously', async () => {
            /* SETUP */
            let nonce = 0;
            const account = addr1.address;
            const points = ethers.parseUnits("1000");

            await claimPointsWithSignature(account, points, nonce);

            /* EXECUTE */
            await claimPointsWithSignature(account, points, ++nonce);

            /* ASSERT */
            expect(await registerPoints.pointsBalance(account)).to.equal(points * 2n);
        });

        it('rejects when invalid nonce', async () => {
            /* SETUP */
            const nonce = 0;
            const account = addr1.address;
            const points = ethers.parseUnits("1000");

            await claimPointsWithSignature(account, points, nonce);

            /* EXECUTE */
            const promise = claimPointsWithSignature(account, points, nonce);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(registerPoints, "InvalidNonce");
        });

        it('rejects when invalid signature', async () => {
            /* SETUP */
            const nonce = 0;
            const account = addr1.address;
            const points = ethers.parseUnits("1000");

            const { data, sig } = await EIP712Fixture(account, points, nonce);

            /* EXECUTE */
            const promise = registerPoints.claimPoints(
                admin.address,
                ethers.parseUnits("100"),
                data.nonce,
                sig.v,
                sig.r,
                sig.s
            );

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(registerPoints, "InvalidSignature");
        });
    });

    describe('batchIsNonceUsed', async () => {
        it('should return false if nonces is not used', async () => {
            /* SETUP */
            const nonces = [0, 1];

            /* EXECUTE */
            const result = await registerPoints.batchIsNonceUsed(nonces);

            /* ASSERT */
            expect(result).to.deep.equal([false, false]);
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
