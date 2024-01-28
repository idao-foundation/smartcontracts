const PermissionStructure = [
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ];
  
  export interface IPermissionStructure {
    deadline: number;
    nonce: number;
  }
  
  export function buildDefaultStructure(chainId: number, verifyingContract: string, data: IPermissionStructure) {
    const { deadline, nonce } = data;
    return {
      domain: {
        name: "RegisterPoints",
        version: "1",
        chainId,
        verifyingContract
      },
      message: {
        deadline, nonce
      },
      primaryType: 'PermissionStructure',
      types: {
        PermissionStructure: PermissionStructure
      }
    }
  }
  