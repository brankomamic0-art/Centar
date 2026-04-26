# Blog storage on Railway

Blog posts and uploaded blog images are file-backed.

On Railway, attach a Volume to the web service. Railway automatically provides
`RAILWAY_VOLUME_MOUNT_PATH`, and the server will store:

- blog JSON data in `$RAILWAY_VOLUME_MOUNT_PATH/data/blog-posts.json`
- uploaded images in `$RAILWAY_VOLUME_MOUNT_PATH/uploads/blog`

No extra variables are required if a Railway Volume is attached.

Optional overrides:

```txt
BLOG_DATA_DIR=/custom/path/data
BLOG_UPLOAD_DIR=/custom/path/uploads/blog
```

For local development without a Railway Volume, the app uses:

- `data/blog-posts.json`
- `uploads/blog/`

