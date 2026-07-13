<?php

declare(strict_types=1);

/**
 * PostgreSQL PDO connector for the Supabase database.
 *
 * The LandedCostEngine writes to the SAME database the storefront/POS/admin
 * read from (public.products, public.inventory_batches, public.supplier_invoices),
 * so product stock stays in sync. Configure via .env or real environment vars:
 *
 *   SUPABASE_DB_HOST=db.<project-ref>.supabase.co
 *   SUPABASE_DB_PORT=5432
 *   SUPABASE_DB_NAME=postgres
 *   SUPABASE_DB_USER=postgres
 *   SUPABASE_DB_PASSWORD=your-db-password
 *   SUPABASE_DB_SSLMODE=require
 *
 * Requires the PHP pdo_pgsql extension (enable extension=pdo_pgsql in php.ini).
 */

/**
 * Load KEY=VALUE pairs from a .env file into getenv()/$_ENV if not already set.
 * Only fills values that are currently unset — real environment wins.
 */
function loadDotEnv(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);

        // Strip surrounding quotes if present.
        if (strlen($value) >= 2
            && (($value[0] === '"' && $value[-1] === '"') || ($value[0] === "'" && $value[-1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        if ($key !== '' && getenv($key) === false) {
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

/**
 * Read a config value from the environment with an optional default.
 */
function envValue(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }
    return $value;
}

/**
 * Build a PDO connection to the Supabase Postgres database.
 *
 * @throws RuntimeException When required configuration is missing.
 */
function createSupabasePdo(): PDO
{
    // Load the project .env (two levels up from /php) as a fallback source.
    loadDotEnv(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env');

    $host = envValue('SUPABASE_DB_HOST');
    $port = envValue('SUPABASE_DB_PORT', '5432');
    $name = envValue('SUPABASE_DB_NAME', 'postgres');
    $user = envValue('SUPABASE_DB_USER', 'postgres');
    $pass = envValue('SUPABASE_DB_PASSWORD', '');
    $sslmode = envValue('SUPABASE_DB_SSLMODE', 'require');

    if ($host === null) {
        throw new RuntimeException(
            'SUPABASE_DB_HOST is not configured. Set the Supabase Postgres connection '
                . 'variables in .env (see php/db.php header).'
        );
    }
    if ($pass === '' ) {
        throw new RuntimeException(
            'SUPABASE_DB_PASSWORD is not configured. Copy it from Supabase → '
                . 'Project Settings → Database.'
        );
    }

    $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s', $host, $port, $name, $sslmode);

    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
