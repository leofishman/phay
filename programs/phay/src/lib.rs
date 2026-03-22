
use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("3QKf5FmT8dChueofJ21TbnNwoCPdF7vet8YPG8uXoz3j"); 

#[program]
pub mod phay {
    use super::*;

    // Initialize the Phay Card (The PDA)
    pub fn initialize_vault(
        ctx: Context<InitializeVault>, 
        user: Pubkey, 
        whitelist: Vec<Pubkey>
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.user = user;
        vault.whitelist = whitelist;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    // Only approve payments to secure addresses and products
    pub fn secure_pay(ctx: Context<SecurePay>, amount: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let dest = ctx.accounts.destination.key();

        // TODO: Add product validation in case the destination is a product
        require!(
            vault.whitelist.contains(&dest),
            PhayError::AddressNotWhitelisted
        );

        // Transfer SOL from PDA to destination
        let ix = system_instruction::transfer(
            &vault.key(),
            &dest,
            amount,
        );

        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.destination.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&[
                b"phay_vault",
                vault.owner.as_ref(),
                &[vault.bump],
            ]],
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + (4 + (32 * 5)) + 1, // 5 addresses?
        seeds = [b"phay_vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VexlyVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SecurePay<'info> {
    #[account(
        mut,
        seeds = [b"phay_vault", vault.owner.as_ref()],
        bump = vault.bump,
        has_one = user, // Only user with role 'Executer' can do payments
    )]
    pub vault: Account<'info, VexlyVault>,
    pub user: Signer<'info>,
    /// CHECK: We validate the destination against the whitelist in the program logic
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct VexlyVault {
    pub owner: Pubkey,
    pub user: Pubkey,
    pub whitelist: Vec<Pubkey>,
    pub bump: u8,
}

#[error_code]
pub enum PhayError {
    #[msg("La dirección de destino no está en la whitelist de Phay.")]
    AddressNotWhitelisted,
}