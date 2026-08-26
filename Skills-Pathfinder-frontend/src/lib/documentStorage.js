const sanitizeFilename = (name = 'document') => {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'document';
};

const makeObjectPath = (userId, file) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const nonce = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${userId}/${stamp}-${nonce}-${sanitizeFilename(file?.name)}`;
};

export const uploadPrivateDocument = async ({ supabase, userId, file, bucket }) => {
  if (!supabase || !userId || !file || !bucket) return null;

  const path = makeObjectPath(userId, file);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });

  if (error) throw error;
  return path;
};

export const getPrivateDocumentUrl = async ({ supabase, bucket, path, expiresIn = 900 }) => {
  if (!supabase || !bucket || !path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
};

export const deletePrivateDocument = async ({ supabase, bucket, path }) => {
  if (!supabase || !bucket || !path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
};
