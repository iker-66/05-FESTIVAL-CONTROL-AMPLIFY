import { Amplify } from 'aws-amplify';
import { confirmSignUp, fetchAuthSession, getCurrentUser, signIn, signOut, signUp } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import type { FestivalEvent, EventStatus } from './data';

type EventRecord = Schema['FestivalEvent']['type'];
type EventInput = Pick<FestivalEvent, 'artist' | 'space' | 'time' | 'status'>;

let client: ReturnType<typeof generateClient<Schema>> | undefined;

export async function configureBackend() {
  const response = await fetch('/amplify_outputs.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('No se encontró la configuración del backend. Despliega primero el backend de Amplify.');
  }

  Amplify.configure(await response.json());
  client = generateClient<Schema>();
}

function getClient() {
  if (!client) {
    throw new Error('El backend todavía no está configurado.');
  }
  return client;
}

function toFestivalEvent(record: EventRecord): FestivalEvent {
  return {
    id: record.id,
    artist: record.artist,
    space: record.space,
    time: record.time,
    status: record.status as EventStatus,
  };
}

export function observeEvents(
  onEvents: (events: FestivalEvent[]) => void,
  onError: (error: Error) => void,
) {
  return getClient().models.FestivalEvent.observeQuery({ authMode: 'apiKey' }).subscribe({
    next: ({ items }) => onEvents(items.map(toFestivalEvent)),
    error: (error: Error) => onError(error),
  });
}

export async function createEvent(event: EventInput) {
  const { errors } = await getClient().models.FestivalEvent.create(
    { id: `EVT-${Date.now().toString().slice(-7)}`, ...event },
    { authMode: 'userPool' },
  );
  if (errors?.length) {
    throw new Error(errors.map(({ message }) => message).join('; '));
  }
}

export async function updateEvent(id: string, event: EventInput) {
  const { errors } = await getClient().models.FestivalEvent.update(
    { id, ...event },
    { authMode: 'userPool' },
  );
  if (errors?.length) {
    throw new Error(errors.map(({ message }) => message).join('; '));
  }
}

export async function deleteEvent(id: string) {
  const { errors } = await getClient().models.FestivalEvent.delete({ id }, { authMode: 'userPool' });
  if (errors?.length) {
    throw new Error(errors.map(({ message }) => message).join('; '));
  }
}

export async function getSignedInUser() {
  const session = await fetchAuthSession();
  if (!session.tokens?.idToken) {
    return null;
  }
  return getCurrentUser();
}

export async function register(email: string, password: string) {
  return signUp({
    username: email,
    password,
    options: {
      userAttributes: { email },
    },
  });
}

export async function confirmRegistration(email: string, confirmationCode: string) {
  return confirmSignUp({ username: email, confirmationCode });
}

export async function logIn(email: string, password: string) {
  return signIn({ username: email, password });
}

export async function logOut() {
  await signOut();
}
