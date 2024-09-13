/** @jsxImportSource frog/jsx */
import { Button, Frog } from 'frog';
import { handle } from 'frog/vercel';
import { neynar } from 'frog/middlewares';
import axios from 'axios';

const app = new Frog({
  basePath: '/api',
  imageOptions: { width: 1200, height: 630 },
  title: 'Scary Garys NFT Checker',
}).use(
  neynar({
    apiKey: 'NEYNAR_FROG_FM',
    features: ['interactor', 'cast'],
  })
);

const SCARY_GARYS_ADDRESS = '0xd652Eeb3431f1113312E5c763CE1d0846Aa4d7BC';
const ALCHEMY_API_KEY = 'pe-VGWmYoLZ0RjSXwviVMNIDLGwgfkao';
const BACKGROUND_IMAGE = 'https://amaranth-adequate-condor-278.mypinata.cloud/ipfs/QmX7Py8TGVGdp3ffXb4XGfd83WwmLZ8FyQV2PEquhAFZ2P';
const ERROR_BACKGROUND_IMAGE = 'https://amaranth-adequate-condor-278.mypinata.cloud/ipfs/Qma1Evr6rzzXoCDG5kzWgD7vekUpdj5VYCdKu8VcgSjxdD';
const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
const AIRSTACK_API_KEY = '103ba30da492d4a7e89e7026a6d3a234e';

interface NFTMetadata {
  tokenId: string;
  imageUrl: string;
}

async function getConnectedAddresses(fid: string): Promise<string[]> {
  console.log('Attempting to fetch connected addresses for FID:', fid);
  try {
    const query = `
      query ConnectedWalletWithFID($fid: String!) {
        Socials(input: {filter: {userId: {_eq: $fid}}, blockchain: ethereum}) {
          Social {
            dappName
            profileName
            userAddress
            connectedAddresses {
              address
              blockchain
            }
          }
        }
      }
    `;

    const variables = { fid };

    const response = await axios.post(
      AIRSTACK_API_URL,
      { query, variables },
      { headers: { Authorization: AIRSTACK_API_KEY } }
    );

    const data = response.data;
    console.log('Full Airstack API response:', JSON.stringify(data, null, 2));

    if (!data.data || !data.data.Socials || !data.data.Socials.Social) {
      console.error('Unexpected response structure from Airstack API');
      return [];
    }

    const addresses = data.data.Socials.Social.flatMap((social: any) =>
      social.connectedAddresses.map((addr: any) => addr.address)
    );

    console.log('Connected addresses:', addresses);
    return addresses;
  } catch (error) {
    console.error('Error in getConnectedAddresses:', error);
    return [];
  }
}

async function getOwnedScaryGarys(address: string): Promise<NFTMetadata[]> {
  const url = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}/getNFTs/`;
  const params = {
    owner: address,
    contractAddresses: [SCARY_GARYS_ADDRESS],
    withMetadata: true,
  };

  try {
    const response = await axios.get(url, { params });
    return response.data.ownedNfts.map((nft: any) => ({
      tokenId: nft.id.tokenId,
      imageUrl: nft.metadata.image,
    }));
  } catch (error) {
    console.error('Error fetching Scary Garys:', error);
    return [];
  }
}

// Test image access directly to diagnose 403 Forbidden errors
const testImageAccess = async (url: string) => {
  try {
    const response = await axios.get(url, { validateStatus: () => true });
    console.log(
      `Image fetch URL: ${url}, Status: ${response.status}, Headers: ${JSON.stringify(
        response.headers
      )}`
    );
  } catch (error) {
    console.error('Error fetching image:', error);
  }
};

// Test the accessibility of the images used in the frame
testImageAccess(BACKGROUND_IMAGE);
testImageAccess(ERROR_BACKGROUND_IMAGE);

app.frame('/', (c) => {
  return c.res({
    image: BACKGROUND_IMAGE,
    imageAspectRatio: '1.91:1',
    intents: [<Button action="/check">Check Scary Garys NFTs</Button>],
  });
});

app.frame('/check', async (c) => {
  console.log('Full frameData:', JSON.stringify(c.frameData, null, 2));
  const { fid } = c.frameData || {};
  const { displayName, pfpUrl } = c.var.interactor || {};

  console.log('FID:', fid);
  console.log('Display Name:', displayName);
  console.log('Profile Picture URL:', pfpUrl);

  let nftAmount = 0;
  let errorMessage = '';
  let backgroundImage = BACKGROUND_IMAGE;

  if (fid) {
    try {
      const connectedAddresses = await getConnectedAddresses(fid.toString());
      if (connectedAddresses.length > 0) {
        const address = connectedAddresses[0]; // Use the first connected address
        console.log('Using Ethereum address:', address);
        const ownedNFTs = await getOwnedScaryGarys(address);
        nftAmount = ownedNFTs.length;
      } else {
        errorMessage = 'No connected Ethereum addresses found';
        backgroundImage = ERROR_BACKGROUND_IMAGE;
      }
    } catch (error) {
      console.error('Error checking NFTs:', error);
      errorMessage = 'Error checking NFTs';
      backgroundImage = ERROR_BACKGROUND_IMAGE;
    }
  } else {
    errorMessage = 'No FID found for the user';
    backgroundImage = ERROR_BACKGROUND_IMAGE;
  }

  const buttonText = errorMessage || `You own ${nftAmount} Scary Garys NFTs. Check again?`;

  const originalFramesLink = 'https://scarygarys-checker.vercel.app/api' // Replace with your actual Frames link

  // Construct the share text with the user's NFT count
  const shareText = `I own ${nftAmount} Scary Garys NFTs! Check your Scary Garys NFTs and make sure to follow @scarygarys on Farcaster!`;

  // Construct the Farcaster share URL with both text and the embedded link
  const farcasterShareURL = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(originalFramesLink)}`;

  return c.res({
    image: backgroundImage,
    imageAspectRatio: '1.91:1',
    intents: [
      <Button action="/check">{buttonText}</Button>,
      <Button.Link href={farcasterShareURL}>Share</Button.Link>,
    ],
  });
});

app.frame('/share', async (c) => {
  const fid = c.req.query('fid');
  
  if (!fid) {
    return c.res({
      image: ERROR_BACKGROUND_IMAGE,
      imageAspectRatio: '1.91:1',
      intents: [
        <Button action="/check">Check Your NFTs</Button>
      ]
    });
  }

  let nftAmount = 0;

  try {
    const connectedAddresses = await getConnectedAddresses(fid.toString());
    if (connectedAddresses.length > 0) {
      const address = connectedAddresses[0];
      const ownedNFTs = await getOwnedScaryGarys(address);
      nftAmount = ownedNFTs.length;
    }
  } catch (error) {
    console.error('Error fetching NFT info:', error);
  }

  return c.res({
    image: (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>Scary Garys NFT Checker</h1>
        <p style={{ fontSize: '36px', marginBottom: '20px' }}>This user owns {nftAmount} Scary Garys NFTs</p>
      </div>
    ),
    imageAspectRatio: '1.91:1',
    intents: [
      <Button action="/check">Check Your NFTs</Button>
    ]
  });
});

export const GET = handle(app);
export const POST = handle(app);