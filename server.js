require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`AuctionPro API running at http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
        });
    } catch (error) {
        console.error("Failed to start AuctionPro:", error.message);
        process.exit(1);
    }
};

startServer();
