import PocketBase from 'pocketbase';

const pocketBaseUrl = import.meta.env.VITE_PB_URL || 'https://pocketbase.andreufont.org';

export const pb = new PocketBase(pocketBaseUrl);
pb.autoCancellation(false);

export interface PocketBaseUser {
  id: string;
  email: string;
}

export function getCloudUser(): PocketBaseUser | null {
  const model = pb.authStore.model;
  if (!pb.authStore.isValid || !model?.id) return null;
  return { id: model.id, email: typeof model.email === 'string' ? model.email : '' };
}

export async function signIn(email: string, password: string): Promise<void> {
  await pb.collection('users').authWithPassword(email, password);
}

export async function signUp(email: string, password: string): Promise<void> {
  await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    emailVisibility: true,
  });
  await signIn(email, password);
}

export function signOut(): void {
  pb.authStore.clear();
}
