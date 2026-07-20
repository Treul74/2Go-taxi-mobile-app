-- TABLE 1: customers
CREATE TABLE customers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id                   UUID UNIQUE REFERENCES auth.users(id)
                            ON DELETE CASCADE,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT UNIQUE,
  phone_number              TEXT UNIQUE,
  country_code              TEXT DEFAULT '+260',
  profile_photo_url         TEXT,
  gender                    TEXT CHECK (gender IN (
                            'male','female','other','prefer_not_to_say')),
  age                       INTEGER CHECK (age >= 16 AND age <= 100),
  account_type              TEXT NOT NULL DEFAULT 'passenger'
                            CHECK (account_type IN ('passenger')),
  account_status            TEXT NOT NULL DEFAULT 'active'
                            CHECK (account_status IN (
                            'active','suspended','pending','deleted')),
  is_verified               BOOLEAN DEFAULT FALSE,
  email_verified            BOOLEAN DEFAULT FALSE,
  phone_verified             BOOLEAN DEFAULT FALSE,
  rating                    DECIMAL(3,2) DEFAULT 0.00
                            CHECK (rating >= 0 AND rating <= 5),
  total_ratings             INTEGER DEFAULT 0,
  total_completed_rides     INTEGER DEFAULT 0,
  total_cancelled_rides     INTEGER DEFAULT 0,
  preferred_payment_method  TEXT DEFAULT 'cash'
                            CHECK (preferred_payment_method IN (
                            'cash','airtel_money','mtn_money','card')),
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE 2: saved_addresses
CREATE TABLE saved_addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  address      TEXT NOT NULL,
  lat          DECIMAL(10,7) NOT NULL,
  lng          DECIMAL(10,7) NOT NULL,
  icon         TEXT DEFAULT 'location',
  is_default   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
