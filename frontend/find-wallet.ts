
import * as dotenv from 'dotenv';
dotenv.config();

import { collections } from './src/lib/db';

async function listAll() {
    try {
        const advertisersCursor = await collections.advertisers();
        const allAdvertisers = await advertisersCursor.find({}).toArray();
        const advertiserMap = Object.fromEntries(allAdvertisers.map(a => [a._id, a.wallet]));
        console.log('Advertisers:', advertiserMap);

        const campaignsCursor = await collections.campaigns();
        const allCampaigns = await campaignsCursor.find({}).toArray();
        console.log('Campaigns:', JSON.stringify(allCampaigns.map(c => ({
            id: c._id,
            name: c.name,
            advertiser: advertiserMap[c.advertiserId] || 'Unknown',
            status: c.verificationStatus
        })), null, 2));

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

listAll();
