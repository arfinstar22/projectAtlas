export var DocumentStatus;
(function (DocumentStatus) {
    DocumentStatus["PENDING"] = "pending";
    DocumentStatus["PROCESSING"] = "processing";
    DocumentStatus["INDEXED"] = "indexed";
    DocumentStatus["ERROR"] = "error";
})(DocumentStatus || (DocumentStatus = {}));
export var SearchMode;
(function (SearchMode) {
    SearchMode["KEYWORD"] = "keyword";
    SearchMode["SEMANTIC"] = "semantic";
    SearchMode["HYBRID"] = "hybrid";
})(SearchMode || (SearchMode = {}));
export var IndexingJobType;
(function (IndexingJobType) {
    IndexingJobType["FOLDER_SCAN"] = "folder_scan";
    IndexingJobType["DOCUMENT_PROCESS"] = "document_process";
    IndexingJobType["REINDEX"] = "reindex";
})(IndexingJobType || (IndexingJobType = {}));
export var JobStatus;
(function (JobStatus) {
    JobStatus["QUEUED"] = "queued";
    JobStatus["RUNNING"] = "running";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
    JobStatus["CANCELLED"] = "cancelled";
})(JobStatus || (JobStatus = {}));
