import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register fonts if needed (using standard fonts for now to avoid loading issues)
// Font.register({ family: 'Roboto', src: 'https://fonts.gstatic.com/s/roboto/v20/KFOmCnqEu92Fr1Mu4mxK.woff2' });
const ROBOTO = 'Helvetica'; // Fallback to standard font

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: ROBOTO,
        fontSize: 10,
        color: '#333',
    },
    planPage: {
        padding: 10, // Minimal padding for max zoom
        fontFamily: ROBOTO,
        fontSize: 10,
        color: '#333',
        flexDirection: 'column',
    },
    header: {
        fontSize: 24,
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    section: {
        margin: 10,
        padding: 10,
        flexGrow: 1,
    },
    subHeader: {
        fontSize: 14,
        marginBottom: 8,
        borderBottomWidth: 1,
        color: '#1f4f82',
        fontWeight: 'bold'
    },
    subHeaderText: {
        fontSize: 12,
        color: '#666',
        marginTop: 4
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 10,
        color: '#333',
        borderBottom: '1px solid #ddd',
        paddingBottom: 5
    },
    planContainer: {
        position: 'relative',
        width: '100%',
        height: 500, // Fixed height for plan view
        backgroundColor: '#f9f9f9',
        border: '1px solid #eee',
        marginBottom: 20,
        overflow: 'hidden'
    },
    planImage: {
        width: '100%',
        height: '100%',
        objectFit: 'contain'
    },
    marker: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFFFF', // White bg
        borderColor: '#1f4f82', // Blue border
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        display: 'flex',
        zIndex: 10,
    },
    markerText: {
        color: '#1f4f82', // Blue text
        fontSize: 10,
        fontWeight: 'bold'
    },
    table: {
        display: 'flex',
        width: '100%',
        borderStyle: 'solid',
        borderColor: '#bfbfbf',
        borderWidth: 1,
        borderRightWidth: 0,
        borderBottomWidth: 0
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomColor: '#bfbfbf',
        borderBottomWidth: 1,
        alignItems: 'center',
        minHeight: 24
    },
    tableColHeader: {
        backgroundColor: '#f0f0f0',
        padding: 5,
        borderRightColor: '#bfbfbf',
        borderRightWidth: 1,
    },
    tableCol: {
        padding: 5,
        borderRightColor: '#bfbfbf',
        borderRightWidth: 1,
    },
    tableCellHeader: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#333'
    },
    tableCell: {
        fontSize: 10,
        color: '#333'
    },
    photoContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 2
    },
    photo: {
        width: 100,
        height: 100,
        objectFit: 'cover',
        marginBottom: 2
    }
});

// Helper to get formatted date
const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
};

export default function ReportPdf({ projectId, projectName, planIds, statuses, dateFrom, dateTo, plansMap, buildingsMap, floorsMap, tasks, summary, photoMode, translations }: any) {

    const t = (key: string) => translations[key] || key;

    const getStatusLabel = (status: string) => {
        if (status === "OPEN") return t("statusOpen");
        if (status === "IN_PROGRESS") return t("statusInProgress");
        if (status === "DONE_WAITING_APPROVAL") return t("statusDoneWaiting");
        if (status === "APPROVED") return t("statusApproved");
        if (status === "REJECTED") return t("statusRejected");
        if (status === "CANCELLED") return t("statusCancelled");
        return status;
    };

    return (
        <Document>
            {/* Title Page */}
            <Page size="A4" style={styles.page}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={styles.header}>{t("title")}</Text>
                    <Text style={{ fontSize: 16, marginBottom: 10 }}>{t("project")}: {projectName || projectId}</Text>
                    <Text style={{ marginBottom: 5 }}>{t("generatedOn")}: {new Date().toLocaleString()}</Text>
                    <Text>{t("statuses")}: {statuses.map((s: string) => getStatusLabel(s)).join(", ")}</Text>
                    {dateFrom && <Text>{t("from")}: {dateFrom}</Text>}
                    {dateTo && <Text>{t("to")}: {dateTo}</Text>}
                </View>

                {/* Summary Section */}
                <View style={styles.section}>
                    <Text style={styles.subHeader}>{t("summary")}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text>{t("totalTasks")}:</Text>
                        <Text>{tasks ? tasks.length : 0}</Text>
                    </View>
                    {Object.entries(summary?.byStatus || {}).map(([s, count]: any) => (
                        <View key={s} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                            <Text>{getStatusLabel(s)}:</Text>
                            <Text>{count}</Text>
                        </View>
                    ))}
                </View>
            </Page>

            {/* Plan Pages with Markers */}
            {planIds.map((planId: string) => {
                const plan = plansMap[planId];
                if (!plan) return null;

                const floor = floorsMap[plan.floor_id];
                const building = buildingsMap[floor?.building_id];
                const planTitle = `${building?.name || "?"} - ${floor?.name || "?"} (v${plan.version})`;

                // Filter tasks for this plan
                const planTasks = tasks?.filter((t: any) => t.plan_id === planId) || [];

                // Calculate Layout
                // A4 Landscape: 842 x 595 points
                const pageWidth = 842;
                const pageHeight = 595;
                const padding = 10;
                const containerWidth = pageWidth - (padding * 2);
                const containerHeight = pageHeight - (padding * 2) - 30; // Subtract space for title

                // Default aspect ratio if missing (should not happen if plan loaded correctly)
                const imgW = plan.image_width || 1000;
                const imgH = plan.image_height || 700;
                const imgRatio = imgW / imgH;
                const containerRatio = containerWidth / containerHeight;

                let renderW, renderH, offsetX, offsetY;

                if (imgRatio > containerRatio) {
                    // Image is wider than container: constrained by width
                    renderW = containerWidth;
                    renderH = containerWidth / imgRatio;
                    offsetX = 0;
                    offsetY = (containerHeight - renderH) / 2;
                } else {
                    // Image is taller than container: constrained by height
                    renderH = containerHeight;
                    renderW = containerHeight * imgRatio;
                    offsetX = (containerWidth - renderW) / 2;
                    offsetY = 0;
                }

                // Use pre-fetched base64 image if available. DO NOT fallback to plan.image_path
                const imageSrc = plan.imageBase64;

                return (
                    <Page key={planId} size="A4" orientation="landscape" style={styles.planPage}>
                        <Text style={[styles.subHeader, { marginBottom: 10 }]}>Plan: {planTitle}</Text>

                        {/* Container for Image and Markers */}
                        <View style={{
                            position: 'relative',
                            width: containerWidth,
                            height: containerHeight,
                            alignSelf: 'center'
                        }}>
                            {imageSrc && (
                                <Image
                                    src={imageSrc}
                                    style={{
                                        width: renderW,
                                        height: renderH,
                                        position: 'absolute',
                                        left: offsetX,
                                        top: offsetY,
                                        objectFit: 'contain'
                                    }}
                                />
                            )}

                            {/* Render Markers */}
                            {planTasks.map((task: any, index: number) => {
                                // Skip tasks without valid coordinates
                                if (task.x_norm === null || task.y_norm === null || isNaN(task.x_norm) || isNaN(task.y_norm)) return null;

                                // Calculate position relative to the Rendered Image
                                // Markers are centered on the point
                                const mX = offsetX + (task.x_norm * renderW) - 16; // - half width (32/2)
                                const mY = offsetY + (task.y_norm * renderH) - 16; // - half height

                                return (
                                    <View
                                        key={task.id}
                                        style={[styles.marker, { left: mX, top: mY }]}
                                    >
                                        <Text style={styles.markerText}>{task.numericLabel || (index + 1)}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </Page>
                );
            })}

            {/* Task Table */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.subHeader}>{t("taskList")}</Text>
                <View style={styles.table}>
                    {/* Header */}
                    <View style={styles.tableRow}>
                        <View style={[styles.tableColHeader, { width: '8%' }]}>
                            <Text style={styles.tableCellHeader}>{t("number")}</Text>
                        </View>
                        <View style={[styles.tableColHeader, { width: '25%' }]}>
                            <Text style={styles.tableCellHeader}>{t("name")}</Text>
                        </View>
                        <View style={[styles.tableColHeader, { width: '12%' }]}>
                            <Text style={styles.tableCellHeader}>{t("status")}</Text>
                        </View>
                        <View style={[styles.tableColHeader, { width: '15%' }]}>
                            <Text style={styles.tableCellHeader}>{t("assigned")}</Text>
                        </View>
                        <View style={[styles.tableColHeader, { width: '15%' }]}>
                            <Text style={styles.tableCellHeader}>{t("dateCreated")}</Text>
                        </View>
                        <View style={[styles.tableColHeader, { width: '25%' }]}>
                            <Text style={styles.tableCellHeader}>{t("photos")}</Text>
                        </View>
                    </View>

                    {/* Rows */}
                    {tasks?.map((task: any, index: number) => (
                        <View key={task.id} style={styles.tableRow} wrap={false}>
                            <View style={[styles.tableCol, { width: '8%' }]}>
                                <Text style={styles.tableCell}>{task.numericLabel || (index + 1)}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '25%' }]}>
                                <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{task.title}</Text>
                                {task.description && <Text style={[styles.tableCell, { color: '#666', fontSize: 8, marginTop: 2 }]}>{task.description}</Text>}
                            </View>
                            <View style={[styles.tableCol, { width: '12%' }]}>
                                <Text style={styles.tableCell}>{getStatusLabel(task.status)}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '15%' }]}>
                                <Text style={styles.tableCell}>{task.assigneeName || "-"}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '15%' }]}>
                                <Text style={styles.tableCell}>{formatDate(task.created_at)}</Text>
                            </View>
                            <View style={[styles.tableCol, { width: '25%' }]}>
                                <View style={styles.photoContainer}>
                                    {(photoMode === "BEFORE" || photoMode === "BOTH") && task.beforePhoto && (
                                        <View style={{ alignItems: 'center' }}>
                                            <Image src={task.beforePhoto} style={styles.photo} />
                                            <Text style={{ fontSize: 8, color: '#666' }}>{t("before")}</Text>
                                        </View>
                                    )}
                                    {(photoMode === "AFTER" || photoMode === "BOTH") && task.afterPhoto && (
                                        <View style={{ alignItems: 'center' }}>
                                            <Image src={task.afterPhoto} style={styles.photo} />
                                            <Text style={{ fontSize: 8, color: '#666' }}>{t("after")}</Text>
                                        </View>
                                    )}
                                    {(!task.beforePhoto && !task.afterPhoto) && <Text style={{ fontSize: 8, color: '#999' }}>{t("none")}</Text>}
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            </Page>
        </Document>
    );
}
