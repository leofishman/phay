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
  const specificMerchant = new anchor.web3.PublicKey("EtE8fCMh9YfvEpV1BSagCoLZtTpA4WFxQN62tCFz5FMW");

  // Deriving the PDA for the Phay Vault
  const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("phay_vault"), owner.publicKey.toBuffer()],
    program.programId
  );

  it("Initializes the Phay Card with a whitelist successfully!", async () => {
    const whitelist = [approvedMerchant.publicKey, specificMerchant];
    const allowedProducts = [new anchor.BN(1), new anchor.BN(2), new anchor.BN(3), new anchor.BN(4)];

    await program.methods
      .initializeVault(user.publicKey, whitelist, allowedProducts)
      .accounts({
        owner: owner.publicKey,
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

  it("Should SUCCEED if the User pays an AUTHORIZED address for an ALLOWED product", async () => {
    // Fund the vault PDA with some SOL so it can transfer
    const fundTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: vaultPDA,
        lamports: 1 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);

    const payAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);
    const validProductId = new anchor.BN(3);

    const initialMerchantBalance = await provider.connection.getBalance(specificMerchant);

    await program.methods
      .securePay(payAmount, validProductId)
      .accounts({
        vault: vaultPDA,
        user: user.publicKey,
        destination: specificMerchant,
      })
      .signers([user])
      .rpc();

    const finalMerchantBalance = await provider.connection.getBalance(specificMerchant);
    expect(finalMerchantBalance - initialMerchantBalance).to.equal(payAmount.toNumber());
    console.log("✅ Phay successfully executed an authorized payment!");
    console.log("Merchant balance: ", finalMerchantBalance);
    console.log("Initial merchant balance: ", initialMerchantBalance);
    console.log("Pay amount: ", payAmount.toNumber());
    console.log("Final merchant balance - Initial merchant balance: ", finalMerchantBalance - initialMerchantBalance);
    console.log("Pay amount: ", payAmount.toNumber());
  })
});

