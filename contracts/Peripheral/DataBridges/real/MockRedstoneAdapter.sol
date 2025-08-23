// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IRedstoneFeed} from "../../../Core/interfaces/external/IRedstoneFeed.sol";

contract MockRedstoneAdapter is IRedstoneFeed {
    struct Data { uint256 price; uint256 updatedAt; }
    mapping(bytes32 => Data) public data;

    function set(bytes32 id, uint256 price, uint256 updatedAt) external {
        data[id] = Data(price, updatedAt);
    }

    function getValue(bytes32 id) external view returns (uint256 price, uint256 updatedAt) {
        Data memory d = data[id];
        require(d.price > 0 && d.updatedAt > 0, "missing");
        return (d.price, d.updatedAt);
    }
}
