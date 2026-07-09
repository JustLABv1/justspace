package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type FileStore struct {
	root string
}

func NewFileStore(root string) (*FileStore, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("create storage root: %w", err)
	}
	return &FileStore{root: root}, nil
}

func (s *FileStore) Save(ctx context.Context, storagePath string, src io.Reader) error {
	fullPath := filepath.Join(s.root, storagePath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return fmt.Errorf("create storage directory: %w", err)
	}

	file, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create storage file: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, &contextReader{ctx: ctx, r: src}); err != nil {
		return fmt.Errorf("write storage file: %w", err)
	}
	return nil
}

func (s *FileStore) Open(storagePath string) (io.ReadCloser, error) {
	fullPath := filepath.Join(s.root, storagePath)
	file, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("open storage file: %w", err)
	}
	return file, nil
}

func (s *FileStore) Delete(storagePath string) error {
	fullPath := filepath.Join(s.root, storagePath)
	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete storage file: %w", err)
	}
	return nil
}

type contextReader struct {
	ctx context.Context
	r   io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	select {
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	default:
		return r.r.Read(p)
	}
}
