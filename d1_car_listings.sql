-- Cloudflare D1 schema for crawler outputs
-- Stores normalized listing JSON; uses (site, id) as composite primary key.

CREATE TABLE IF NOT EXISTS car_listings (
  listing_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  price REAL,
  discount_price REAL,
  year INTEGER,
  mileage_km INTEGER,
  engine_cc INTEGER,
  transmission TEXT,
  fuel TEXT,
  brand TEXT,
  brand_slug TEXT,
  model TEXT,
  model_pk INTEGER,
  model_sts INTEGER DEFAULT 0, -- 0=unknown, 1=succ, 2=fail
  seats INTEGER,
  color TEXT,
  manu_color_name TEXT,
  gen_color_name TEXT,
  gen_color_code TEXT,
  licence_expiry TEXT,
  body_type TEXT,
  first_registration_count INTEGER,
  seller_name TEXT,
  seller_phone TEXT,
  contact TEXT,
  summary TEXT,
  remark TEXT,
  photos TEXT, -- JSON array of image URLs
  last_update_datetime TEXT,
  vehicle_type TEXT,
  sold INTEGER, -- 0/1
  sts INTEGER DEFAULT 1, -- 0=disabled/1=enabled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (site, id)
);

-- Brand lookup table (slug as primary key, supports English and zh_TW names)
CREATE TABLE IF NOT EXISTS brands (
  slug TEXT PRIMARY KEY,
  name_en TEXT,
  name_zh_tw TEXT,
  name_zh_hk TEXT,
  sts TEXT, -- 0-disabled, 1=enabled
  electric TEXT, -- 0-no, 1=yes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_car_listings_brand_model_year
  ON car_listings (brand, model, year);

CREATE INDEX IF NOT EXISTS idx_car_listings_brand_slug
  ON car_listings (brand_slug);

CREATE INDEX IF NOT EXISTS idx_car_listings_site_sold
  ON car_listings (site, sold);

CREATE INDEX IF NOT EXISTS idx_car_listings_model_pk
  ON car_listings (model_pk);

CREATE INDEX IF NOT EXISTS idx_car_listings_model_sts
  ON car_listings (model_sts);

-- Photos per listing (referenced by listing_pk)
CREATE TABLE IF NOT EXISTS car_listings_photo (
  photo_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_pk INTEGER NOT NULL,
  url TEXT NOT NULL,
  url_r2_square TEXT,
  url_r2 TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (listing_pk, url)
);

CREATE INDEX IF NOT EXISTS idx_car_listings_photo_listing
  ON car_listings_photo (listing_pk);

-- Model catalogue (normalized plus raw JSON blob)
CREATE TABLE IF NOT EXISTS models (
  model_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  merged_to_model_pk INTEGER,
  brand TEXT,
  brand_slug TEXT NOT NULL,
  model_slug TEXT,
  manu_model_code TEXT,
  body_type TEXT,
  engine_cc TEXT,
  power_kw TEXT,
  horse_power_ps TEXT,
  range TEXT,
  manu_country TEXT,
  power TEXT,
  turbo TEXT,
  facelift TEXT,
  transmission TEXT,
  transmission_gears TEXT,
  mileage_km INTEGER,
  model_name TEXT,
  model_name_slug TEXT,
  manu_color_name TEXT,
  gen_color_name TEXT,
  gen_color_code TEXT,
  raw_json TEXT, -- original JSON payload for audit/debug
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (brand_slug, model_slug),
  UNIQUE (brand_slug, manu_model_code, model_name)
);

CREATE INDEX IF NOT EXISTS idx_models_brand_code
  ON models (brand_slug, manu_model_code);
  
CREATE INDEX IF NOT EXISTS idx_models_model_name_slug ON models (model_name_slug);


-- Model info content (per locale)
CREATE TABLE IF NOT EXISTS models_info (
  info_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  model_pk INTEGER NOT NULL,
  locale TEXT NOT NULL,
  heading TEXT,
  subheading TEXT,
  summary TEXT,
  hero_img_1 TEXT,
  hero_img_2 TEXT,
  hero_img_3 TEXT,
  youtube_url_1 TEXT,
  youtube_url_2 TEXT,
  youtube_url_3 TEXT,
  ig_url TEXT,
  facebbook_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (model_pk, locale)
);

CREATE INDEX IF NOT EXISTS idx_models_info_model
  ON models_info (model_pk);

-- ChatGPT batch jobs (track batch lifecycle and usage)
CREATE TABLE IF NOT EXISTS chatgpt_batches (
  batch_id TEXT PRIMARY KEY,
  status TEXT, -- queued, running, completed, failed, cancelled
  submitted_at DATETIME,
  completed_at DATETIME,
  failed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  request_json TEXT, -- payload sent to ChatGPT batch API
  response_json TEXT, -- raw response metadata
  error_message TEXT,
  usage_prompt_tokens INTEGER,
  usage_completion_tokens INTEGER,
  usage_total_tokens INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Items inside a batch, linked to car listings
CREATE TABLE IF NOT EXISTS chatgpt_batch_items (
  item_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  listing_pk INTEGER, -- optional FK to car_listings
  site TEXT,
  listing_id TEXT,
  status TEXT, -- pending, submitted, completed, failed
  result_json TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (batch_id, site, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_batch_items_batch
  ON chatgpt_batch_items (batch_id);

CREATE INDEX IF NOT EXISTS idx_chatgpt_batch_items_listing
  ON chatgpt_batch_items (site, listing_id);

-- Listing-specific options generated by ChatGPT
CREATE TABLE IF NOT EXISTS car_listing_options (
  option_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_pk INTEGER NOT NULL,
  item TEXT NOT NULL,
  certainty TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (listing_pk, item, certainty)
);

CREATE INDEX IF NOT EXISTS idx_car_listing_options_listing
  ON car_listing_options (listing_pk);

-- Listing-specific remarks generated by ChatGPT
CREATE TABLE IF NOT EXISTS car_listing_remarks (
  remark_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_pk INTEGER NOT NULL,
  item TEXT NOT NULL,
  remark TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (listing_pk, item)
);

CREATE INDEX IF NOT EXISTS idx_car_listing_remarks_listing
  ON car_listing_remarks (listing_pk);

-- Seed popular brands
INSERT OR IGNORE INTO brands (slug, name_en, name_zh_tw, name_zh_hk) VALUES
  ('toyota', 'Toyota', '豐田', '豐田'),
  ('honda', 'Honda', '本田', '本田'),
  ('bmw', 'BMW', '寶馬', '寶馬'),
  ('mercedes-benz', 'Mercedes-Benz', '平治', '平治'),
  ('audi', 'Audi', '奧迪', '奧迪'),
  ('volkswagen', 'Volkswagen', '大眾', '大眾'),
  ('nissan', 'Nissan', '日產', '日產'),
  ('lexus', 'Lexus', '凌志', '凌志'),
  ('mazda', 'Mazda', '馬自達', '馬自達'),
  ('subaru', 'Subaru', '速霸陸', '速霸陸'),
  ('porsche', 'Porsche', '保時捷', '保時捷'),
  ('tesla', 'Tesla', '特斯拉', '特斯拉'),
  ('volvo', 'Volvo', '富豪', '富豪'),
  ('jaguar', 'Jaguar', '捷豹', '捷豹'),
  ('land-rover', 'Land Rover', '路虎', '路虎'),
  ('mini', 'MINI', '迷你', '迷你'),
  ('kia', 'Kia', '起亞', '起亞'),
  ('hyundai', 'Hyundai', '現代', '現代'),
  ('mitsubishi', 'Mitsubishi', '三菱', '三菱'),
  ('suzuki', 'Suzuki', '鈴木', '鈴木'),
  ('byd', 'BYD', '比亞迪', '比亞迪'),
  ('nio', 'NIO', '蔚來', '蔚來'),
  ('xpeng', 'XPeng', '小鵬', '小鵬'),
  ('zeekr', 'Zeekr', '極氪', '極氪'),
  ('polestar', 'Polestar', '極星', '極星'),
  ('mg', 'MG', '名爵', '名爵'),
  ('ora', 'ORA', '歐拉', '歐拉'),
  ('smart', 'Smart', '精靈', '精靈'),
  ('renault', 'Renault', '雷諾', '雷諾'),
  ('peugeot', 'Peugeot', '標緻', '標緻'),
  ('citroen', 'Citroen', '雪鐵龍', '雪鐵龍'),
  ('fiat', 'Fiat', '菲亞特', '菲亞特'),
  ('seat', 'SEAT', '西雅特', '西雅特'),
  ('skoda', 'Skoda', '斯柯達', '斯柯達'),
  ('alfa-romeo', 'Alfa Romeo', '阿爾法羅密歐', '阿爾法羅密歐'),
  ('aston-martin', 'Aston Martin', '阿士頓馬田', '阿士頓馬田'),
  ('bentley', 'Bentley', '賓利', '賓利'),
  ('bugatti', 'Bugatti', '布加迪', '布加迪'),
  ('ferrari', 'Ferrari', '法拉利', '法拉利'),
  ('lamborghini', 'Lamborghini', '林寶堅尼', '林寶堅尼'),
  ('maserati', 'Maserati', '瑪莎拉蒂', '瑪莎拉蒂'),
  ('mclaren', 'McLaren', '麥拿侖', '麥拿侖'),
  ('rolls-royce', 'Rolls-Royce', '勞斯萊斯', '勞斯萊斯'),
  ('infiniti', 'Infiniti', '英菲尼迪', '英菲尼迪'),
  ('acura', 'Acura', '謳歌', '謳歌'),
  ('ds', 'DS Automobiles', 'DS', 'DS'),
  ('cupra', 'Cupra', '庫普拉', '庫普拉'),
  ('rivian', 'Rivian', 'Rivian', 'Rivian'),
  ('lucid', 'Lucid', 'Lucid', 'Lucid'),
  ('vinfast', 'VinFast', 'VinFast', 'VinFast'),
  ('daihatsu', 'Daihatsu', '大發', '大發'),
  ('dongfeng', 'Dongfeng', '東風', '東風'),
  ('ford', 'Ford', '福特', '福特'),
  ('foton', 'Foton', '福田', '福田'),
  ('hino', 'Hino', '日野', '日野'),
  ('im-motors', 'IM Motors', '智己', '智己'),
  ('isuzu', 'Isuzu', '五十鈴', '五十鈴'),
  ('jac', 'JAC', '江淮', '江淮'),
  ('jeep', 'Jeep', '吉普', '吉普'),
  ('lotus', 'Lotus', '蓮花', '蓮花'),
  ('maxus', 'Maxus', 'MAXUS', 'MAXUS'),
  ('opel', 'Opel', '歐寶', '歐寶'),
  ('scania', 'Scania', 'SCANIA', 'SCANIA'),
  ('sinotruk', 'Sinotruk', '中國重汽', '中國重汽'),
  ('ssangyong', 'SsangYong', '雙龍', '雙龍');



-- Core users
CREATE TABLE IF NOT EXISTS users (
  user_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  phone TEXT,
  locale TEXT DEFAULT 'zh-hk',
  role TEXT DEFAULT 'user', -- user, dealer, admin
  status TEXT DEFAULT 'active', -- active, disabled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth accounts (Google, etc.)
CREATE TABLE IF NOT EXISTS user_accounts (
  account_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  user_pk INTEGER NOT NULL,
  provider TEXT NOT NULL, -- google, apple, etc.
  provider_user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_user_id),
  FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

-- Sessions (if you want DB-backed sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
  session_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  user_pk INTEGER NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

-- Favorites / watchlist
CREATE TABLE IF NOT EXISTS user_favorites (
  favorite_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  user_pk INTEGER NOT NULL,
  listing_pk INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_pk, listing_pk),
  FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  FOREIGN KEY (listing_pk) REFERENCES car_listings(listing_pk)
);

-- Saved searches / alerts
CREATE TABLE IF NOT EXISTS user_saved_searches (
  search_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  user_pk INTEGER NOT NULL,
  name TEXT,
  query_json TEXT NOT NULL, -- filters as JSON
  notify INTEGER DEFAULT 0, -- 0/1
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

-- Lead / inquiry messages
CREATE TABLE IF NOT EXISTS user_inquiries (
  inquiry_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  user_pk INTEGER,
  listing_pk INTEGER NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'new', -- new, replied, closed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  FOREIGN KEY (listing_pk) REFERENCES car_listings(listing_pk)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_pk);
CREATE INDEX IF NOT EXISTS idx_user_inquiries_listing ON user_inquiries(listing_pk);


