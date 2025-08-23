// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

abstract contract BaseAlias {
    address public immutable canonicalExt0;
    address public immutable canonicalExt1;
    address public immutable internalAlias0;
    address public immutable internalAlias1;

    constructor(address _ext0, address _ext1, address _alias0, address _alias1) {
        canonicalExt0 = _ext0;
        canonicalExt1 = _ext1;
        internalAlias0 = _alias0;
        internalAlias1 = _alias1;
    }

    function _isRequestedOrder(address a0, address a1) internal view returns (bool) {
        if (a0 == internalAlias0 && a1 == internalAlias1) return true;
        if (a0 == internalAlias1 && a1 == internalAlias0) return false;
        if (a0 == canonicalExt0 && a1 == canonicalExt1) return true;
        if (a0 == canonicalExt1 && a1 == canonicalExt0) return false;
        revert("unsupported pair");
    }
}


