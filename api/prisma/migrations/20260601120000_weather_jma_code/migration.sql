-- 天気予報の取得元を OpenWeatherMap から気象庁 防災情報XML に切り替える。
-- WeatherForecast は毎回 total-replace されるキャッシュなので、既存行は削除して作り直す。
DELETE FROM "WeatherForecast";

-- OWM 固有カラムを削除
ALTER TABLE "WeatherForecast" DROP COLUMN "weatherId";
ALTER TABLE "WeatherForecast" DROP COLUMN "icon";

-- 気象庁 天気予報用テロップ番号
ALTER TABLE "WeatherForecast" ADD COLUMN "weatherCode" INTEGER NOT NULL;

-- 気象庁は当日分などで気温を持たない場合があるため nullable に変更
ALTER TABLE "WeatherForecast" ALTER COLUMN "tempMin" DROP NOT NULL;
ALTER TABLE "WeatherForecast" ALTER COLUMN "tempMax" DROP NOT NULL;
