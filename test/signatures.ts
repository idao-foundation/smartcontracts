import { IPermissionStructure, buildDefaultStructure } from "./types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

export async function signHardhat(signer: HardhatEthersSigner, verifyingContract: string, data: IPermissionStructure) {
  const chainId = await getChainId(signer);

  const { domain, message, types } = buildDefaultStructure(chainId, verifyingContract, data);

  return signer.signTypedData(domain, types, message);
}

async function getChainId(signer: HardhatEthersSigner): Promise<number> {
  const provider = signer.provider;
  const network = await provider.getNetwork();
  return Number(network.chainId);
}
