import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Phay } from "../target/types/phay";

// This script allows testing Phay transactions on a real network (Localnet, Devnet, Mainnet)
async function main() {
  // Set up the Anchor provider based on environment variables. 
  // Make sure ANCHOR_PROVIDER_URL and ANCHOR_WALLET are set!
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  // Assumes the IDL is available in target/types/phay.ts
  const program = anchor.workspace.Phay as Program<Phay>;

  // The wallet acting as the funder/parent of the vault
  const owner = provider.wallet;

  // The simulated user/child that will be authorized to consume products
  const user = anchor.web3.Keypair.generate();
  
  // The specific whitelisted merchant the user wants to test with
  const specificMerchant = new anchor.web3.PublicKey("EtE8fCMh9YfvEpV1BSagCoLZtTpA4WFxQN62tCFz5FMW");

  console.log("-----------------------------------------");
  console.log("💳 Creating Phay Vault on", provider.connection.rpcEndpoint);
  console.log("-----------------------------------------");
  
  // Airdrop SOL to the owner so they can pay the transaction fees
  try {
    const airdropSig = await provider.connection.requestAirdrop(owner.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdropSig);
    console.log("Airdropped 5 SOL to Owner");
  } catch(e) { /* Ignore if airdrop fails, e.g. on mainnet */ }

  console.log("Owner:", owner.publicKey.toBase58());
  console.log("User:", user.publicKey.toBase58());
  console.log("Whitelisting Merchant:", specificMerchant.toBase58());

  // Derive the PDA for the Phay Vault
  const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("phay_vault"), owner.publicKey.toBuffer()],
    program.programId
  );

  console.log("Vault Address (PDA):", vaultPDA.toBase58());

  // Define Whitelist and specific Products IDs to allow
  const whitelist = [specificMerchant];
  
  // These represent IDs for real products from your merchant's database
  const allowedProducts = [
    new anchor.BN(101), // Basic tier
    new anchor.BN(102), // Standard tier
    new anchor.BN(999)  // Example test product
  ];

  console.log("Products allowed by IDs:", allowedProducts.map(p => p.toNumber()).join(", "));

  try {
    console.log("\n⏳ Sending initializeVault transaction...");
    
    // Call the initializeVault instruction
    const tx = await program.methods
      .initializeVault(user.publicKey, whitelist, allowedProducts)
      .accounts({
        owner: owner.publicKey, // Vault and SystemProgram are auto-resolved
      })
      .rpc();

    console.log("✅ Transaction successful!");
    console.log("Signature:", tx);

    // Verify by fetching the vault's on-chain data
    const vaultAccount = await program.account.phayVault.fetch(vaultPDA);
    console.log("\n🔐 On-chain Vault Verified State:");
    console.log("  Owner:", vaultAccount.owner.toBase58());
    console.log("  User:", vaultAccount.user.toBase58());
    console.log("  Whitelisted Addresses:", vaultAccount.whitelist.map(pk => pk.toBase58()).join(", "));
    console.log("  Allowed Product IDs:", vaultAccount.allowedProducts.map(id => id.toNumber()).join(", "));

  } catch (error) {
    console.error("\n❌ Failed to initialize vault:", error);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
