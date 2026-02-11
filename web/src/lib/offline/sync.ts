import { Network } from '@capacitor/network';
import { StorageService } from './storage';
import { MutationQueue, QueuedMutation } from './queue';
import { supabase } from '@/lib/supabase';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
    success: boolean;
    syncedCount: number;
    failedCount: number;
    errors: string[];
}

/**
 * Background sync manager
 * Handles syncing queued mutations when connection is restored
 */
export class SyncService {
    private static isSyncing = false;
    private static syncListeners: Array<(status: SyncStatus) => void> = [];

    /**
     * Initialize sync service and set up network listeners
     */
    static async initialize(): Promise<void> {
        // Listen for network status changes
        Network.addListener('networkStatusChange', async (status) => {
            console.log('Network status changed:', status);

            if (status.connected && !this.isSyncing) {
                console.log('Connection restored, starting sync...');
                await this.sync();
            }
        });

        // Check initial network status and sync if online
        const status = await Network.getStatus();
        if (status.connected) {
            await this.sync();
        }
    }

    /**
     * Add a sync status listener
     */
    static addListener(callback: (status: SyncStatus) => void): void {
        this.syncListeners.push(callback);
    }

    /**
     * Remove a sync status listener
     */
    static removeListener(callback: (status: SyncStatus) => void): void {
        this.syncListeners = this.syncListeners.filter((cb) => cb !== callback);
    }

    /**
     * Notify all listeners of status change
     */
    private static notifyListeners(status: SyncStatus): void {
        this.syncListeners.forEach((callback) => callback(status));
    }

    /**
     * Sync all pending mutations
     */
    static async sync(): Promise<SyncResult> {
        if (this.isSyncing) {
            console.log('Sync already in progress');
            return {
                success: false,
                syncedCount: 0,
                failedCount: 0,
                errors: ['Sync already in progress'],
            };
        }

        this.isSyncing = true;
        this.notifyListeners('syncing');

        const result: SyncResult = {
            success: true,
            syncedCount: 0,
            failedCount: 0,
            errors: [],
        };

        try {
            const queue = await MutationQueue.getQueue();
            console.log(`Syncing ${queue.length} pending mutations...`);

            for (const mutation of queue) {
                try {
                    await this.processMutation(mutation);
                    await MutationQueue.dequeue(mutation.id);
                    result.syncedCount++;
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    console.error(`Failed to sync mutation ${mutation.id}:`, error);

                    const shouldRetry = await MutationQueue.markFailed(
                        mutation.id,
                        errorMessage
                    );

                    if (!shouldRetry) {
                        result.errors.push(
                            `Mutation ${mutation.id} failed permanently: ${errorMessage}`
                        );
                    }

                    result.failedCount++;
                    result.success = false;
                }
            }

            console.log(
                `Sync completed: ${result.syncedCount} succeeded, ${result.failedCount} failed`
            );
            this.notifyListeners('success');
        } catch (error) {
            console.error('Sync error:', error);
            result.success = false;
            result.errors.push(error instanceof Error ? error.message : String(error));
            this.notifyListeners('error');
        } finally {
            this.isSyncing = false;
            this.notifyListeners('idle');
        }

        return result;
    }

    /**
     * Process a single mutation
     */
    private static async processMutation(
        mutation: QueuedMutation
    ): Promise<void> {
        const { type, resource, data } = mutation;

        console.log(`Processing ${type} mutation for ${resource}`);

        switch (type) {
            case 'CREATE':
                await this.handleCreate(resource, data);
                break;
            case 'UPDATE':
                await this.handleUpdate(resource, data);
                break;
            case 'DELETE':
                await this.handleDelete(resource, data);
                break;
            default:
                throw new Error(`Unknown mutation type: ${type}`);
        }
    }

    /**
     * Handle CREATE mutation
     */
    private static async handleCreate(
        resource: string,
        data: any
    ): Promise<void> {
        const { error } = await supabase.from(resource).insert(data);

        if (error) {
            throw new Error(`Failed to create ${resource}: ${error.message}`);
        }
    }

    /**
     * Handle UPDATE mutation
     */
    private static async handleUpdate(
        resource: string,
        data: any
    ): Promise<void> {
        const { id, ...updateData } = data;

        if (!id) {
            throw new Error('Update mutation missing id');
        }

        const { error } = await supabase
            .from(resource)
            .update(updateData)
            .eq('id', id);

        if (error) {
            throw new Error(`Failed to update ${resource}: ${error.message}`);
        }
    }

    /**
     * Handle DELETE mutation
     */
    private static async handleDelete(
        resource: string,
        data: any
    ): Promise<void> {
        const { id } = data;

        if (!id) {
            throw new Error('Delete mutation missing id');
        }

        const { error } = await supabase.from(resource).delete().eq('id', id);

        if (error) {
            throw new Error(`Failed to delete ${resource}: ${error.message}`);
        }
    }

    /**
     * Get current sync status
     */
    static getSyncStatus(): SyncStatus {
        return this.isSyncing ? 'syncing' : 'idle';
    }

    /**
     * Check if currently syncing
     */
    static isCurrentlySyncing(): boolean {
        return this.isSyncing;
    }

    /**
     * Get pending mutations count
     */
    static async getPendingCount(): Promise<number> {
        return await MutationQueue.size();
    }
}
