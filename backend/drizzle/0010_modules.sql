ALTER TABLE settings ADD COLUMN modules text;
UPDATE settings
SET modules = '{"ordering":{"enabled":' || CASE selection_enabled WHEN 1 THEN 'true' ELSE 'false' END || ',"mode":"summary"},"ai":{"enabled":' || CASE ai_chat_enabled WHEN 1 THEN 'true' ELSE 'false' END || ',"voiceEnabled":' || CASE WHEN ai_chat_enabled = 1 AND ai_voice_enabled = 1 THEN 'true' ELSE 'false' END || '},"analytics":{"enabled":true}}'
WHERE modules IS NULL;
