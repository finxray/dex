// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../structs/QuoteParams.sol";

/// @notice Adapter that forces asset0/asset1 to external pool tokens for a wrapped data bridge
contract AlphaDataBridgeAdapter is IDataBridge {
    address public immutable inner;
    address public immutable forcedAsset0;
    address public immutable forcedAsset1;

    constructor(address _inner, address _forcedAsset0, address _forcedAsset1) {
        inner = _inner;
        forcedAsset0 = _forcedAsset0;
        forcedAsset1 = _forcedAsset1;
    }

    function getData(QuoteParams memory params) external override returns (bytes memory) {
        QuoteParams memory p2 = QuoteParams({
            asset0: forcedAsset0,
            asset1: forcedAsset1,
            quoter: params.quoter,
            amount: params.amount,
            asset0Balance: params.asset0Balance,
            asset1Balance: params.asset1Balance,
            bucketID: params.bucketID,
            zeroForOne: params.zeroForOne
        });
        return IDataBridge(inner).getData(p2);
    }
}


