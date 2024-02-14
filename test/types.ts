const PermissionStructure = [
    { name: 'amount', type: 'uint256'},
    { name: 'receiver', type: 'address'},
    { name: 'nonce', type: 'uint256' },
  ];
  
  export interface IPermissionStructure {
    amount: bigint;
    receiver: string;
    nonce: number;
  }
  
  export function buildDefaultStructure(chainId: number, verifyingContract: string, data: IPermissionStructure) {
    const { amount, receiver, nonce } = data;
    return {
      domain: {
        name: "IDAO.Forecast.Contracts.RegisterPoints",
        version: "1.0.0",
        chainId,
        verifyingContract
      },
      message: {
        amount, receiver, nonce
      },
      primaryType: 'ClaimForecastPoints',
      types: {
        ClaimForecastPoints: PermissionStructure
      }
    }
  }
  