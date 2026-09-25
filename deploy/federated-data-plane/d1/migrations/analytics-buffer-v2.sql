-- 조회 계획에서 사용하지 않는 인덱스만 제거하여 이벤트당 쓰기량을 줄인다.
-- v1 전체 DDL과 checkpoint 검증 후 --upgrade의 원자 batch에서만 실행한다.
DROP INDEX traffic_page_view_session_occurred_idx;
DROP INDEX traffic_page_view_visitor_occurred_idx;
DROP INDEX traffic_page_view_path_occurred_idx;
DROP INDEX traffic_share_event_session_occurred_idx;
DROP INDEX traffic_share_event_path_occurred_idx;
DROP INDEX traffic_share_event_channel_occurred_idx;
