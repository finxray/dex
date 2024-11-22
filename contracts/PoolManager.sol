// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;  

import {ERC6909Claims} from "./ERC6909Claims.sol";
import {SwapParams} from "./structs/SwapParams.sol";
import {IMarketDataQuoter} from "./interfaces/internal/IMarketDataQuoter.sol";
import {IStoixQuoter} from "./interfaces/internal/IStoixQuoter.sol";
import {MarketData} from "./structs/MarketData.sol";
import {StoixQuoterRequest} from "./structs/StoixQuoterRequest.sol";
import {PoolIDHelper} from "./libraries/PoolIDHelper.sol";
import {QuoteParams} from "./structs/QuoteParams.sol";

contract PoolManager is ERC6909Claims { 
    // using PoolIDHelper for *;

    function brothers() public {
        
    }

    function swap() public returns (bool success) {

    }



    // batch swap is done via multiple calls of swap function 
    function quote(SwapParams calldata params) public returns (uint256) {
        uint256 poolID = PoolIDHelper.poolID(params.quoter, params.bucketID, params.currencyID);
        MarketData memory marketData = IMarketDataQuoter(params.quoter).quoteMarket(params.currencyID);
        (uint128 inventory0, uint128 inventory1) = inventory(poolID);
        QuoteParams memory quoterParams = QuoteParams(
            params.amount,
            params.zeroForOne,
            inventory0,
            inventory1
        );

        StoixQuoterRequest memory request = StoixQuoterRequest(
            params.bucketID,
            marketData,
            quoterParams
        );
        return IStoixQuoter(params.quoter).quote(request);
    } 
    
    function inventory(uint256 poolID) public view returns (uint128 inventory0, uint128 inventory1) {
        // dummy function 
        inventory0 = 250; 
        inventory1 = 1246;
    } 

}



