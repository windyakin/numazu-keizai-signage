-- アメダス現在気温（今日の最高/最低が無いときの表示用）。今日の行のみ設定される。
ALTER TABLE "WeatherForecast" ADD COLUMN "tempCurrent" DOUBLE PRECISION;
