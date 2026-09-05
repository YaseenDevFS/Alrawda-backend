// backend/scripts/clearDatabase.js
import pool from '../db/db.js';
import dotenv from 'dotenv';

dotenv.config();

const clearDatabase = async () => {
  try {
    console.log('🔄 Starting database cleanup...');
    
    // ترتيب الحذف مهم - نحذف من الأبناء إلى الآباء
    const tables = [
      'story_views',
      'saved_posts',
      'likes',
      'comments',
      'posts',
      'follows',
      'users'
    ];
    
    for (const table of tables) {
      console.log(`🗑️ Clearing table: ${table}`);
      await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
      console.log(`✅ Table ${table} cleared`);
    }
    
    console.log('✅ All tables cleared successfully!');
    
    // إعادة تعيين الـ sequences (Auto-increment)
    console.log('🔄 Resetting sequences...');
    await pool.query(`
      SELECT setval('users_id_seq', 1, false);
      SELECT setval('posts_id_seq', 1, false);
      SELECT setval('comments_id_seq', 1, false);
      SELECT setval('likes_id_seq', 1, false);
      SELECT setval('follows_id_seq', 1, false);
      SELECT setval('saved_posts_id_seq', 1, false);
      SELECT setval('stories_id_seq', 1, false);
      SELECT setval('story_views_id_seq', 1, false);
    `);
    console.log('✅ Sequences reset successfully!');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
};

clearDatabase()
  .then(() => {
    console.log('🎉 Database cleanup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to clear database:', error);
    process.exit(1);
  });