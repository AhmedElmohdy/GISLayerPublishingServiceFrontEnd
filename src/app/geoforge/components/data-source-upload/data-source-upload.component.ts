import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ToasterService } from '@abp/ng.theme.shared';
import { interval, switchMap, takeWhile } from 'rxjs';
import { GeoForgeService } from '../../services/geoforge.service';
import {
  CreateRemoteDataSource,
  FILE_FORMAT_OPTIONS,
  FileFormatOption,
  GEOMETRY_TYPE_LABELS,
  IMPORT_STATUS_LABELS,
  ImportJob,
  ImportMode,
  RemoteAuthType,
  RemoteServiceMetadata,
  SOURCE_TYPE_OPTIONS,
  SourceProbeResult,
  SourceTypeOption,
  SridSource,
  UploadResult,
  isTerminalStatus,
} from '../../models/geoforge.models';

/**
 * The wizard's stages. `source` is the new first step where the user chooses whether to upload
 * a file or point at a service — importing from Esri is no longer a hidden fallback.
 *
 * `featureClass` is entered only by a File Geodatabase, which is a container of several feature
 * classes rather than a single dataset.
 */
type WizardStep =
  | 'source'
  | 'select'
  | 'connect'
  | 'featureClass'
  | 'configure'
  | 'probe'
  | 'import'
  | 'done';

@Component({
  selector: 'app-data-source-upload',
  standalone: false,
  templateUrl: './data-source-upload.component.html',
})
export class DataSourceUploadComponent {
  private readonly service = inject(GeoForgeService);
  private readonly toaster = inject(ToasterService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly geometryLabels = GEOMETRY_TYPE_LABELS;
  readonly importStatusLabels = IMPORT_STATUS_LABELS;
  readonly sourceOptions = SOURCE_TYPE_OPTIONS;
  readonly fileFormats = FILE_FORMAT_OPTIONS;
  readonly AuthType = RemoteAuthType;

  readonly step = signal<WizardStep>('source');
  readonly busy = signal(false);

  // The chosen source kind.
  readonly sourceOption = signal<SourceTypeOption | null>(null);
  readonly isFileSource = computed(() => this.sourceOption()?.kind === 'file');
  readonly isEsriSource = computed(() => this.sourceOption()?.kind === 'esri');
  readonly isUrlSource = computed(() => this.sourceOption()?.kind === 'url');

  // Common.
  readonly dataSourceId = signal<string | null>(null);
  readonly probe = signal<SourceProbeResult | null>(null);
  readonly job = signal<ImportJob | null>(null);

  // File source.
  readonly file = signal<File | null>(null);
  readonly upload = signal<UploadResult | null>(null);

  /** The format the operator picked. Sent as `sourceType`; `.zip` alone is ambiguous. */
  readonly fileFormat = signal<FileFormatOption | null>(null);

  /** The feature class chosen out of a File Geodatabase. */
  readonly selectedFeatureClass = signal<string | null>(null);

  // Remote/Esri source.
  readonly remoteName = signal('');
  readonly remoteUrl = signal('');
  readonly collectionId = signal('');
  readonly authType = signal<RemoteAuthType>(RemoteAuthType.None);
  readonly username = signal('');
  readonly password = signal('');
  readonly token = signal('');
  readonly clientId = signal('');
  readonly clientSecret = signal('');
  readonly tokenEndpoint = signal('');
  readonly metadata = signal<RemoteServiceMetadata | null>(null);
  readonly selectedRemoteLayerId = signal<number | null>(null);

  // CSV binding.
  readonly csvXColumn = signal('');
  readonly csvYColumn = signal('');
  readonly csvWktColumn = signal('');
  readonly csvSrid = signal<number | null>(4326);

  // Import options.
  readonly layerName = signal('');
  readonly displayName = signal('');
  readonly description = signal('');
  readonly sridOverride = signal<number | null>(null);
  readonly indexedFields = signal<string[]>([]);
  readonly rejectThreshold = signal(5);
  readonly autoPublish = signal(false);

  readonly isCsv = computed(() => this.upload()?.detectedSourceType === 'csv');
  readonly isGdb = computed(() => this.upload()?.detectedSourceType === 'gdb');

  readonly canImport = computed(() => {
    const p = this.probe();
    return !!p && p.blockingIssues.length === 0 && this.layerName().length > 0;
  });

  readonly sridIsGuessed = computed(() => {
    const p = this.probe();
    return !!p && (p.sridSource === SridSource.Inferred || p.sridSource === SridSource.None);
  });

  /** The service exposes several layers; the user must pick one before probing. */
  readonly needsLayerPick = computed(() => {
    const m = this.metadata();
    return !!m && !m.selectedLayer && m.layers.length > 0;
  });

  // ---- Step 0: choose the source kind --------------------------------------

  chooseSource(option: SourceTypeOption): void {
    this.sourceOption.set(option);
    this.authType.set(RemoteAuthType.None);

    this.step.set(option.kind === 'file' ? 'select' : 'connect');
  }

  // ---- File flow -----------------------------------------------------------

  /** Picking a format resets any file already chosen under the previous one. */
  chooseFileFormat(format: FileFormatOption): void {
    this.fileFormat.set(format);
    this.file.set(null);
    this.upload.set(null);
    this.probe.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] ?? null;

    this.file.set(selected);
    this.upload.set(null);
    this.probe.set(null);

    if (selected) {
      // Strip ".gdb.zip" as one unit, otherwise the layer slug keeps a stray "_gdb".
      const stem = selected.name.replace(/(\.gdb)?\.[^.]+$/i, '');
      this.displayName.set(stem);
      this.layerName.set(this.toSlug(stem));
    }
  }

  uploadFile(): void {
    const selected = this.file();
    if (!selected) {
      return;
    }

    this.busy.set(true);
    this.service
      .upload(selected, this.displayName() || undefined, this.fileFormat()?.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.upload.set(result);
          this.dataSourceId.set(result.dataSourceId);
          this.busy.set(false);

          switch (result.detectedSourceType) {
            // A CSV carries no geometry binding; a geodatabase carries several feature classes.
            // Both need one more answer from the operator before a probe can mean anything.
            case 'csv':
              this.step.set('configure');
              break;
            case 'gdb':
              this.step.set('featureClass');
              this.discover();
              break;
            default:
              this.step.set('probe');
              this.runProbe();
          }
        },
        error: () => this.busy.set(false),
      });
  }

  // ---- File Geodatabase: pick a feature class -------------------------------

  /**
   * Persists the chosen feature class on the data source, then probes it. The reader reads the
   * name back out of `ConfigurationJson`, exactly as the CSV reader reads its X/Y binding.
   */
  pickFeatureClass(name: string): void {
    const id = this.dataSourceId();
    if (!id) {
      return;
    }

    this.selectedFeatureClass.set(name);

    // A geodatabase's feature class name is the better default layer name.
    this.displayName.set(name);
    this.layerName.set(this.toSlug(name));

    this.busy.set(true);
    this.service
      .updateDataSource(id, this.displayName(), JSON.stringify({ featureClass: name }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.runProbe(),
        error: () => this.busy.set(false),
      });
  }

  saveCsvConfiguration(): void {
    const id = this.dataSourceId();
    if (!id) {
      return;
    }

    const configuration: Record<string, unknown> = {
      delimiter: ',',
      encoding: 'utf-8',
      sourceSrid: this.csvSrid(),
    };

    if (this.csvWktColumn()) {
      configuration['wktColumn'] = this.csvWktColumn();
    } else {
      configuration['xColumn'] = this.csvXColumn();
      configuration['yColumn'] = this.csvYColumn();
    }

    this.busy.set(true);
    this.service
      .updateDataSource(id, this.displayName(), JSON.stringify(configuration))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.step.set('probe');
          this.runProbe();
        },
        error: () => this.busy.set(false),
      });
  }

  // ---- Remote flow ---------------------------------------------------------

  /** Creates the remote data source, then discovers it (validate connection + preview). */
  connectRemote(): void {
    const option = this.sourceOption();
    if (!option || !this.remoteUrl()) {
      return;
    }

    const input: CreateRemoteDataSource = {
      name: this.remoteName() || this.deriveNameFromUrl(this.remoteUrl()),
      sourceType: option.value,
      url: this.remoteUrl().trim(),
      collectionId: this.collectionId() || undefined,
      credential: this.buildCredential(),
    };

    this.busy.set(true);
    this.service
      .createRemote(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ds => {
          this.dataSourceId.set(ds.id);
          this.displayName.set(input.name);
          this.layerName.set(this.toSlug(input.name));
          this.discover();
        },
        error: () => this.busy.set(false),
      });
  }

  /**
   * Reads the source metadata and either shows a sub-layer picker or moves to the probe preview.
   * Used by both the remote flow and the File Geodatabase flow — the server answers one endpoint.
   */
  discover(): void {
    const id = this.dataSourceId();
    if (!id) {
      return;
    }

    this.busy.set(true);
    this.service
      .discover(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: meta => {
          this.metadata.set(meta);
          this.busy.set(false);

          if (meta.selectedLayer) {
            // A single feature class, or a URL that already identified a layer — probe now.
            this.runProbe();
          } else if (meta.layers.length === 0) {
            this.toaster.warn(meta.message ?? 'The source exposes no importable layers.');
          }
          // Otherwise the template shows the picker (needsLayerPick()).
        },
        error: () => this.busy.set(false),
      });
  }

  /** The operator picked a sub-layer; append it to the URL and re-discover that layer. */
  pickRemoteLayer(layerId: number): void {
    const id = this.dataSourceId();
    if (!id) {
      return;
    }

    this.selectedRemoteLayerId.set(layerId);
    const layeredUrl = `${this.remoteUrl().replace(/\/+$/, '')}/${layerId}`;

    this.busy.set(true);
    this.service
      .updateDataSource(
        id,
        this.displayName(),
        JSON.stringify({ url: layeredUrl, harvestStrategy: 'objectIdRange' }),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.discover(),
        error: () => this.busy.set(false),
      });
  }

  private buildCredential() {
    if (this.authType() === RemoteAuthType.None) {
      return undefined;
    }

    return {
      authType: this.authType(),
      username: this.username() || undefined,
      password: this.password() || undefined,
      token: this.token() || undefined,
      clientId: this.clientId() || undefined,
      clientSecret: this.clientSecret() || undefined,
      tokenEndpoint: this.tokenEndpoint() || undefined,
    };
  }

  // ---- Probe (shared) ------------------------------------------------------

  runProbe(): void {
    const id = this.dataSourceId();
    if (!id) {
      return;
    }

    this.busy.set(true);
    this.service
      .probe(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.probe.set(result);
          this.busy.set(false);
          this.step.set('probe');

          if (result.detectedSrid) {
            this.sridOverride.set(result.detectedSrid);
          }
        },
        error: () => this.busy.set(false),
      });
  }

  toggleIndexedField(name: string): void {
    const current = this.indexedFields();
    this.indexedFields.set(
      current.includes(name) ? current.filter(f => f !== name) : [...current, name],
    );
  }

  startImport(): void {
    const id = this.dataSourceId();
    if (!id || !this.canImport()) {
      return;
    }

    this.busy.set(true);
    this.service
      .import(id, {
        layerName: this.layerName(),
        displayName: this.displayName() || this.layerName(),
        description: this.description() || undefined,
        mode: ImportMode.CreateNew,
        sridOverride: this.sridOverride() ?? undefined,
        indexedFields: this.indexedFields(),
        rejectThresholdPercent: this.rejectThreshold(),
        autoPublish: this.autoPublish(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: job => {
          this.job.set(job);
          this.step.set('import');
          this.busy.set(false);
          this.pollJob(job.id);
        },
        error: () => this.busy.set(false),
      });
  }

  private pollJob(jobId: string): void {
    interval(2000)
      .pipe(
        switchMap(() => this.service.getImportJob(jobId)),
        takeWhile(job => !isTerminalStatus(job.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(job => {
        this.job.set(job);
        if (isTerminalStatus(job.status)) {
          this.step.set('done');
        }
      });
  }

  cancelImport(): void {
    const job = this.job();
    if (!job) {
      return;
    }

    this.service
      .cancelImportJob(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => this.job.set(updated));
  }

  viewLayer(): void {
    const job = this.job();
    if (job?.gisLayerId) {
      void this.router.navigate(['/geoforge/layers', job.gisLayerId]);
    }
  }

  restart(): void {
    this.step.set('source');
    this.sourceOption.set(null);
    this.fileFormat.set(null);
    this.file.set(null);
    this.upload.set(null);
    this.probe.set(null);
    this.job.set(null);
    this.metadata.set(null);
    this.selectedFeatureClass.set(null);
    this.dataSourceId.set(null);
    this.indexedFields.set([]);
    this.remoteUrl.set('');
    this.remoteName.set('');
  }

  rejectedRowsUrl(): string {
    const job = this.job();
    return job ? this.service.rejectedRowsUrl(job.id) : '';
  }

  private deriveNameFromUrl(url: string): string {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => /server$/i.test(p));
      return idx > 0 ? parts[idx - 1] : parts[parts.length - 1] || 'Remote layer';
    } catch {
      return 'Remote layer';
    }
  }

  private toSlug(value: string): string {
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return /^[a-z]/.test(slug) ? slug : `layer_${slug}`;
  }
}
