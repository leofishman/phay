use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("3QKf5FmT8dChueofJ21TbnNwoCPdF7vet8YPG8uXoz3j"); 

#[program]
pub mod phay {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>, 
        user: Pubkey, 
        whitelist: Vec<Pubkey>,
        allowed_products: Vec<u64> // Added this parameter
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.user = user;
        vault.whitelist = whitelist;
        vault.allowed_products = allowed_products; // Now it's initialized
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn secure_pay(
        ctx: Context<SecurePay>, 
        amount: u64, 
        product_id: u64 
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let dest = ctx.accounts.destination.key();

        require!(
            vault.whitelist.contains(&dest),
            PhayError::AddressNotWhitelisted
        );

        // PRODUCT VALIDATION: Check if the product_id is allowed
        require!(
            vault.allowed_products.contains(&product_id),
            PhayError::InvalidProduct
        );

        let ix = system_instruction::transfer(&vault.key(), &dest, amount);

        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.destination.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&[b"phay_vault", vault.owner.as_ref(), &[vault.bump]]],
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        // Adjusted space: 8 + 32 + 32 + (4 + 32*5) + (4 + 8*10) + 1
        // (Discriminator + Owner + User + WhitelistVec + ProductsVec + Bump)
        space = 8 + 32 + 32 + 164 + 84 + 1, 
        seeds = [b"phay_vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PhayVault>, // Fixed name
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
        has_one = user, 
    )]
    pub vault: Account<'info, PhayVault>, // Fixed name
    pub user: Signer<'info>,
    /// CHECK: The destination address is manually checked against the whitelist in the instruction logic
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PhayVault {
    pub owner: Pubkey,
    pub user: Pubkey,
    pub whitelist: Vec<Pubkey>,
    pub allowed_products: Vec<u64>, 
    pub bump: u8,
}

#[error_code]
pub enum PhayError {
    #[msg("La dirección de destino no está en la whitelist de Phay.")]
    AddressNotWhitelisted,
    #[msg("Este producto no está autorizado para su consumo.")]
    InvalidProduct, // Added missing error
}