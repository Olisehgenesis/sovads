
import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma';

async function listAll() {
    try {
        const allAdvertisers = await prisma.advertiser.findMany()
        const advertiserMap = Object.fromEntries(allAdvertisers.map(a => [a.id, a.wallet]));
        console.log('Advertisers:', advertiserMap);

        const allCampaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } })
        console.log('Campaigns:', JSON.stringify(allCampaigns.map(c => ({
            id: c.id,
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
