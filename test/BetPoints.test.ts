import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AccessManager, BetPoints } from "../typechain-types";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { Wallet } from "ethers";


describe('BetContract', () => {
    let betPoints: BetPoints;
    let manager: AccessManager;
    let signers: HardhatEthersSigner[];

    before(async () => {
        await reset();

        signers = await ethers.getSigners();
    });

    beforeEach(async () => {
        const AccessManager = await ethers.getContractFactory("AccessManager");
        manager = await AccessManager.deploy(signers[0]);

        const BetPoints = await ethers.getContractFactory("BetPoints");
        betPoints = await upgrades.deployProxy(BetPoints, [manager.target.toString()]) as unknown as BetPoints;
    })

    it("Test math", async () => {
        const realPrice = ethers.parseEther("2000.0");
        const maxBets = 150;

        // 20 баллов распределяем, средний балл 2
        // таргет по умолчанию 20 / 2 = 10 адресов

        // от 1 до 9 - вознаграждается только топ 1 (1 балл)
        // 10 - цель совпала с фактом, награждаем всех (3 балла топ 1, по diff посередине, 1 балл топ 10)
        // 11 до 100 - топ 10 как обычно, остальные 0
        // 101 до 199 - новый средний балл больше 1 (следовательно и новый макс балл), награждается топ 10%
        // 200 и более - новый средний балл меньше 1 (каждый пользователь из топ 20 получает по 1 баллу)


        for (let i = 0; i < maxBets; i++) {
            const address = ethers.toBeHex(i, 20);
            const err = ethers.parseEther((maxBets - 1).toString()) - ethers.parseEther(i.toString());
            // const err = 0n;
            console.log(err)

            await betPoints.addUserToRatingAndSort(ethers.ZeroHash, address, err + realPrice, realPrice, { gasLimit: 30_000_000 });
        }

        const res = await betPoints.getRating(ethers.ZeroHash)
        console.log(res);
 // 1000000000000000000
        // const rating = res.points.map((p) => Number(p));
        // const sum = rating.reduce((a, b) => a + b, 0);
        // console.log({sum})
    }); //  1.100000000000000000
        // 10.000000000000000000

        // 0.047619047619047619
});