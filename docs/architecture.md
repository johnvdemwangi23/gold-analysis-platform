# Platform Architecture

## Objective

Build a standalone GOLD/XAUUSD market intelligence and chart analysis platform.

## Initial Architecture

The platform will use a monorepo structure managed with pnpm.

The primary analysis application will live in `apps/analysis`.

Shared functionality will be separated into reusable packages for:

- charting
- indicators
- market data
- database access
- UI components
- configuration

Supabase will provide the initial database layer.

Market data will use canonical instrument naming, with XAUUSD as the primary internal symbol and broker-specific aliases handled separately.

MT5 will remain responsible for trade execution while the standalone platform focuses on analysis, research, visualization, and strategy intelligence.
