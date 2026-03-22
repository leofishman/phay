import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Phay } from "../target/types/phay";
import { expect } from "chai";

describe("phay", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Phay as Program<Phay>;

  // Generamos cuentas de prueba
  const owner = provider.wallet;
  const user = anchor.web3.Keypair.generate();
  const approvedMerchant = anchor.web3.Keypair.generate();
  const hackerAddress = anchor.web3.Keypair.generate();

  // Encontrar el PDA
  const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("phay_vault"), owner.publicKey.toBuffer()],
    program.programId
  );

  it("Inicializa la Phay Card con éxito!", async () => {
    const whitelist = [approvedMerchant.publicKey];

    await program.methods
      .initializeVault(user.publicKey, whitelist)
      .accounts({
        vault: vaultPDA,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vaultAccount = await program.account.vexlyVault.fetch(vaultPDA);
    expect(vaultAccount.user.toBase58()).to.equal(user.publicKey.toBase58());
  });

  it("Debería FALLAR si el usuario intenta pagar a una dirección NO autorizada", async () => {
    // Primero fondeamos el PDA (necesita SOL para transferir)
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: vaultPDA,
        lamports: 1 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(tx);

    try {
      await program.methods
        .securePay(new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL))
        .accounts({
          vault: vaultPDA,
          user: user.publicKey,
          destination: hackerAddress.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user]) // El usuario firma la transacción
        .rpc();

      expect.fail("El programa debería haber lanzado un error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("AddressNotWhitelisted");
      console.log("✅ Bloqueo exitoso: El 'hacker' no recibió fondos.");
    }
  });
});