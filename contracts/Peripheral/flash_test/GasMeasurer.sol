// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IDataBridge} from "../../Core/interfaces/internal/IDataBridge.sol";
import {QuoteParams} from "../../Core/structs/QuoteParams.sol";

contract GasMeasurer {
    function measure(address bridge, QuoteParams memory p) external returns (bytes memory) {
        return IDataBridge(bridge).getData(p);
    }
}


