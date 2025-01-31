 struct Marking {
        bool isDexMarket;
        bool isOracleMarket;
        bool isDexDefault;
        bool isOracleDefault;
        uint8 dexStorageAddress; // 4 bits
        uint8 oracleStorageAddress; // 4 bits
        uint16 bucketID; // 12 bits
}