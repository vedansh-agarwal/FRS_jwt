git update-index --skip-worktree ../server/app.js;
git update-index --skip-worktree ../server/.env;
git update-index --skip-worktree ../../log_files/admin_activity_log.txt;
git update-index --skip-worktree ../../log_files/user_capture_log.txt;
nodemon app.js;