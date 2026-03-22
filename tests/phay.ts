import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Phay } from "../target/types/phay";
import { expect } from "chai";

describe("phay", () => {
  // Configure the client to use the local cluster provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Phay as Program<Phay>;

  // Test accounts
  const owner = provider.wallet; // The one who creates and funds the vault
  const user = anchor.web3.Keypair.generate(); // The "child" or "freelancer"
  const approvedMerchant = anchor.web3.Keypair.generate();
  const unauthorizedHacker = anchor.web3.Keypair.generate();

  // Deriving the PDA for the Phay Vault
  const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("phay_vault"), owner.publicKey.toBuffer()],
    program.programId
  );

  it("Initializes the Phay Card with a whitelist successfully!", async () => {
    const whitelist = [approvedMerchant.publicKey];
    const allowedProducts = [new anchor.BN(1), new anchor.BN(2)];

    await program.methods
      .initializeVault(user.publicKey, whitelist, allowedProducts)
      .accounts({
        vault: vaultPDA,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Fetch account data to verify state
    const vaultAccount = await program.account.phayVault.fetch(vaultPDA);
    expect(vaultAccount.user.toBase58()).to.equal(user.publicKey.toBase58());
    expect(vaultAccount.whitelist[0].toBase58()).to.equal(approvedMerchant.publicKey.toBase58());
  });

  it("Should FAIL if the user tries to buy a FORBIDDEN product", async () => {
    const forbiddenProductId = new anchor.BN(999); // e.g., Alcohol/Cigarettes ID

    try {
      await program.methods
        .securePay(new anchor.BN(1000000), forbiddenProductId)
        .accounts({
          vault: vaultPDA,
          user: user.publicKey,
          destination: approvedMerchant.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      expect.fail("Should have failed due to InvalidProduct");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidProduct");
      console.log("✅ Phay successfully blocked a forbidden product purchase!");
    }
  });

  it("Should FAIL if the User tries to pay an UNAUTHORIZED address", async () => {
    try {
      await program.methods
        .securePay(new anchor.BN(0.05 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(1))
        .accounts({
          vault: vaultPDA,
          user: user.publicKey,
          destination: unauthorizedHacker.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      expect.fail("The transaction should have been blocked by the whitelist");
    } catch (err: any) {
      // Check that the error returned is our custom PhayError
      expect(err.error.errorCode.code).to.equal("AddressNotWhitelisted");
      console.log("✅ Security check passed: Unauthorized payment blocked.");
    }
  });
});