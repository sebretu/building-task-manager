import { mapSupabaseError } from './errors';
import type { Database } from './db.types';

// Minimalny interfejs klienta, żeby nie łapać konfliktów klas z dwóch node_modules.
type RpcClient = {
  rpc: (fn: string, args?: unknown) => Promise<{ data: any; error: any }>;
};

export async function rpcListTasks(client: RpcClient, args: Database['public']['Functions']['list_tasks']['Args']) {
  const { data, error } = await client.rpc('list_tasks', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcGetTask(client: RpcClient, args: Database['public']['Functions']['get_task']['Args']) {
  const { data, error } = await client.rpc('get_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcStartTask(client: RpcClient, args: Database['public']['Functions']['start_task']['Args']) {
  const { data, error } = await client.rpc('start_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcReopenTask(client: RpcClient, args: Database['public']['Functions']['reopen_task']['Args']) {
  const { data, error } = await client.rpc('reopen_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcSubmitTaskDone(client: RpcClient, args: Database['public']['Functions']['submit_task_done']['Args']) {
  const { data, error } = await client.rpc('submit_task_done', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcApproveTask(client: RpcClient, args: Database['public']['Functions']['approve_task']['Args']) {
  const { data, error } = await client.rpc('approve_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcRejectTask(client: RpcClient, args: Database['public']['Functions']['reject_task']['Args']) {
  const { data, error } = await client.rpc('reject_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcAdminResetTaskToOpen(
  client: RpcClient,
  args: Database['public']['Functions']['admin_reset_task_to_open']['Args']
) {
  const { data, error } = await client.rpc('admin_reset_task_to_open', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcCreateTask(client: RpcClient, args: Database['public']['Functions']['create_task']['Args']) {
  const { data, error } = await client.rpc('create_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcUpdateTask(client: RpcClient, args: Database['public']['Functions']['update_task']['Args']) {
  const { data, error } = await client.rpc('update_task', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcListTaskHistory(
  client: RpcClient,
  args: Database['public']['Functions']['list_task_history']['Args']
) {
  const { data, error } = await client.rpc('list_task_history', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcListTaskComments(
  client: RpcClient,
  args: Database['public']['Functions']['list_task_comments']['Args']
) {
  const { data, error } = await client.rpc('list_task_comments', args);
  if (error) throw mapSupabaseError(error);
  return data;
}

export async function rpcListTaskPhotos(
  client: RpcClient,
  args: Database['public']['Functions']['list_task_photos']['Args']
) {
  const { data, error } = await client.rpc('list_task_photos', args);
  if (error) throw mapSupabaseError(error);
  return data;
}
